import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Autocomplete,
  TextField,
  Tooltip,
  CircularProgress,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  FormControlLabel,
  IconButton,
  Chip,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  OpenInNew as OpenInNewIcon,
  ReceiptLong as ReceiptIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalanceWallet as BalanceIcon,
  Inventory as InventoryIcon,
  ArrowForward as ArrowForwardIcon,
  FileDownload as FileDownloadIcon,
  Print as PrintIcon,
  ShoppingBag as ShoppingBagIcon,
  CheckCircle as CheckCircleIcon,
  FilterAlt as FilterAltIcon,
  Close as CloseIcon,
  Person as PersonIcon,
  Business as BusinessIcon,
  Clear as ClearIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../../store/hooks';
import {
  productApi,
  stockApi,
  ledgerAccountApi,
  ProductTransactionDetail,
  ProductTransactionsResponse,
} from '../../services/api';
import DateInput, { getCurrentDate, formatDateDisplay } from '../../components/DateInput';

interface ProductOption {
  _id: string;
  name: string;
  code?: string;
  sku?: string;
  barcode?: string;
  systemBarcode?: string;
  category?: string;
  unit?: string;
  unitOfMeasureId?: { name?: string; shortCode?: string } | string;
  sellingPrice?: number;
  retailPrice?: number;
  currentStock?: number;
}

interface PartyOption {
  _id: string;
  name: string;
  code?: string;
  mobile?: string;
  phone?: string;
}

export default function ProductTransactionDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  // Products for the combobox
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);

  // Customer & Supplier master lists for the filter window
  const [customers, setCustomers] = useState<PartyOption[]>([]);
  const [suppliers, setSuppliers] = useState<PartyOption[]>([]);
  const [loadingParties, setLoadingParties] = useState<boolean>(false);

  // Filter Window State
  const [partyFilterOpen, setPartyFilterOpen] = useState<boolean>(false);
  const [filterByCustomer, setFilterByCustomer] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<PartyOption | null>(null);
  const [filterBySupplier, setFilterBySupplier] = useState<boolean>(false);
  const [selectedSupplier, setSelectedSupplier] = useState<PartyOption | null>(null);

  // Date filters: default to current date
  const [fromDate, setFromDate] = useState<string>(getCurrentDate());
  const [toDate, setToDate] = useState<string>(getCurrentDate());
  const [activeDatePreset, setActiveDatePreset] = useState<'today' | 'thisMonth' | 'all' | 'custom'>('today');

  // Filter & Search
  const [selectedType, setSelectedType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Transactions data state
  const [loadingTransactions, setLoadingTransactions] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProductTransactionsResponse | null>(null);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Load products list for combobox
  useEffect(() => {
    if (!companyId) return;
    setLoadingProducts(true);
    productApi
      .list(companyId, { limit: 3000 })
      .then((res) => {
        const d = res.data?.data as { products: ProductOption[] };
        const list = (d?.products ?? []) as ProductOption[];
        setProducts(list);

        // If navigated with location.state?.productId or location.state?.product, pre-select
        const stateProductId = (location.state as any)?.productId || (location.state as any)?.product?._id;
        if (stateProductId) {
          const found = list.find((p) => p._id === stateProductId);
          if (found) {
            setSelectedProduct(found);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load products for combobox:', err);
      })
      .finally(() => {
        setLoadingProducts(false);
      });
  }, [companyId, location.state]);

  // Load customers and suppliers for the party filter dialog
  useEffect(() => {
    if (!companyId) return;
    setLoadingParties(true);
    Promise.all([
      ledgerAccountApi.list(companyId, 'Customer'),
      ledgerAccountApi.list(companyId, 'Supplier'),
    ])
      .then(([custRes, suppRes]) => {
        setCustomers((custRes.data?.data as PartyOption[]) ?? []);
        setSuppliers((suppRes.data?.data as PartyOption[]) ?? []);
      })
      .catch((err) => {
        console.error('Failed to load customers/suppliers for filter:', err);
      })
      .finally(() => {
        setLoadingParties(false);
      });
  }, [companyId]);

  // Load transactions when selected product or backend filters change
  const loadTransactions = useCallback(async () => {
    if (!selectedProduct?._id || !companyId) {
      setData(null);
      return;
    }
    setLoadingTransactions(true);
    setError(null);
    try {
      const res = await stockApi.getProductTransactions(selectedProduct._id, companyId, {
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        type: selectedType !== 'All' ? selectedType : undefined,
        financialYearId: financialYearId || undefined,
      });
      if (res.data?.success && res.data.data) {
        setData(res.data.data);
      } else {
        setData(null);
      }
    } catch (err: any) {
      console.error('Failed to load product transactions:', err);
      setError(err.response?.data?.message || 'Failed to load transaction history.');
    } finally {
      setLoadingTransactions(false);
    }
  }, [selectedProduct?._id, companyId, financialYearId, fromDate, toDate, selectedType]);

  useEffect(() => {
    if (selectedProduct?._id && companyId) {
      loadTransactions();
    }
  }, [selectedProduct?._id, companyId, fromDate, toDate, selectedType, loadTransactions]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/report/product-transaction-details') {
        loadTransactions();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/product-transaction-details') || window.location.pathname.includes('/report/product-transaction-details')) {
        loadTransactions();
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:database-updated', onDatabaseUpdated);
    window.addEventListener('app:products-updated', onWindowActivated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:database-updated', onDatabaseUpdated);
      window.removeEventListener('app:products-updated', onWindowActivated);
    };
  }, [loadTransactions]);

  // Date preset handler
  const handlePresetSelect = (preset: 'today' | 'thisMonth' | 'all') => {
    setActiveDatePreset(preset);
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'today') {
      const cur = getCurrentDate();
      setFromDate(cur);
      setToDate(cur);
    } else if (preset === 'thisMonth') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(toYMD(first));
      setToDate(toYMD(today));
    } else if (preset === 'all') {
      setFromDate('');
      setToDate('');
    }
  };

  // Local table filter: applies search query AND customer / supplier checkbox filters
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    let list = data.transactions;

    // 1. Party Filter (Customer / Supplier)
    if (filterByCustomer || filterBySupplier) {
      list = list.filter((t) => {
        let matchCustomer = false;
        let matchSupplier = false;

        // Customer Matching
        if (filterByCustomer) {
          const isCustomerTx =
            t.partyType === 'Customer' ||
            t.type === 'Sales' ||
            t.type === 'SalesReturn' ||
            (t.voucherName || '').toLowerCase().includes('sales');

          if (isCustomerTx) {
            if (selectedCustomer) {
              matchCustomer = Boolean(
                (t.partyId && t.partyId === selectedCustomer._id) ||
                (t.partyName && t.partyName.toLowerCase() === selectedCustomer.name.toLowerCase())
              );
            } else {
              // Customer checkbox checked with no specific customer: match all customer txns
              matchCustomer = true;
            }
          }
        }

        // Supplier Matching
        if (filterBySupplier) {
          const isSupplierTx =
            t.partyType === 'Supplier' ||
            t.type === 'Purchase' ||
            t.type === 'PurchaseReturn' ||
            (t.voucherName || '').toLowerCase().includes('purchase');

          if (isSupplierTx) {
            if (selectedSupplier) {
              matchSupplier = Boolean(
                (t.partyId && t.partyId === selectedSupplier._id) ||
                (t.partyName && t.partyName.toLowerCase() === selectedSupplier.name.toLowerCase())
              );
            } else {
              // Supplier checkbox checked with no specific supplier: match all supplier txns
              matchSupplier = true;
            }
          }
        }

        if (filterByCustomer && filterBySupplier) {
          return matchCustomer || matchSupplier;
        }
        if (filterByCustomer) return matchCustomer;
        if (filterBySupplier) return matchSupplier;
        return true;
      });
    }

    // 2. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((t) => {
        return (
          (t.voucherNo || '').toLowerCase().includes(q) ||
          (t.voucherName || '').toLowerCase().includes(q) ||
          (t.partyName || '').toLowerCase().includes(q) ||
          (t.narration || '').toLowerCase().includes(q) ||
          (t.batchNumber || '').toLowerCase().includes(q) ||
          (t.type || '').toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [data?.transactions, filterByCustomer, selectedCustomer, filterBySupplier, selectedSupplier, searchQuery]);

  // Is any party filter currently applied?
  const isPartyFilterActive = filterByCustomer || filterBySupplier;

  // Clear customer filter
  const handleClearCustomerFilter = () => {
    setFilterByCustomer(false);
    setSelectedCustomer(null);
  };

  // Clear supplier filter
  const handleClearSupplierFilter = () => {
    setFilterBySupplier(false);
    setSelectedSupplier(null);
  };

  // Reset all party filters
  const handleResetPartyFilters = () => {
    setFilterByCustomer(false);
    setSelectedCustomer(null);
    setFilterBySupplier(false);
    setSelectedSupplier(null);
  };

  // Double-click navigation to voucher document
  const handleOpenVoucher = (t: ProductTransactionDetail) => {
    const type = (t.type || '').toLowerCase();
    const vName = (t.voucherName || '').toLowerCase();
    const vNo = (t.voucherNo || '').toUpperCase();
    const refType = (t.referenceType || '').toLowerCase();
    const refId = t.referenceId;
    const invType = t.invoiceType;

    // 1. Sales Return
    if (
      type === 'salesreturn' ||
      refType === 'salesreturn' ||
      vName.includes('sales return') ||
      vNo.startsWith('SR')
    ) {
      navigate('/entry/sales-return', {
        state: { returnId: refId, invoiceId: refId, invoiceNo: t.voucherNo },
      });
      return;
    }

    // 2. Sales (POS, B2B, B2C)
    if (
      type === 'sales' ||
      refType === 'salesinvoice' ||
      vName.includes('sales') ||
      vNo.startsWith('INV') ||
      vNo.startsWith('POS') ||
      vNo.startsWith('B2C') ||
      vNo.startsWith('B2B')
    ) {
      if (invType === 'POS' || vNo.startsWith('POS')) {
        navigate('/entry/pos', {
          state: { invoiceId: refId, invoiceNo: t.voucherNo },
        });
        return;
      }
      if (invType === 'B2B' || vNo.startsWith('B2B')) {
        navigate('/entry/sales-b2b', {
          state: { invoiceId: refId, invoiceNo: t.voucherNo },
        });
        return;
      }
      navigate('/entry/sales-b2c', {
        state: { invoiceId: refId, invoiceNo: t.voucherNo },
      });
      return;
    }

    // 3. Purchase Return
    if (
      type === 'purchasereturn' ||
      refType === 'purchasereturn' ||
      vName.includes('purchase return') ||
      vNo.startsWith('PR')
    ) {
      navigate('/entry/purchase-return', {
        state: { returnId: refId, invoiceId: refId, invoiceNo: t.voucherNo },
      });
      return;
    }

    // 4. Purchase Invoice
    if (
      type === 'purchase' ||
      refType === 'purchase' ||
      refType === 'purchaseinvoice' ||
      vName.includes('purchase') ||
      vNo.startsWith('PUR')
    ) {
      navigate('/entry/purchase', {
        state: {
          purchaseId: refId,
          invoiceId: refId,
          id: refId,
          invoiceNo: t.voucherNo,
        },
      });
      return;
    }

    // 5. Damage / Wastage
    if (
      type === 'damage' ||
      type === 'wastage' ||
      invType === 'DAMAGE' ||
      vName.includes('damage') ||
      vName.includes('wastage') ||
      vNo.startsWith('DMG')
    ) {
      navigate('/entry/damage-wastage', {
        state: { damageId: refId, id: refId, entryNo: t.voucherNo },
      });
      return;
    }

    // 6. Stock Adjustment
    if (
      type === 'adjustment' ||
      refType === 'stockadjustment' ||
      vName.includes('adjustment') ||
      vNo.startsWith('ADJ')
    ) {
      navigate('/entry/stock-adjustment', {
        state: { adjustmentId: refId, id: refId, adjustmentNo: t.voucherNo },
      });
      return;
    }

    // 7. Opening Stock
    if (
      type === 'opening' ||
      refType === 'openingstockentry' ||
      vName.includes('opening') ||
      vNo.startsWith('OP')
    ) {
      navigate('/entry/opening-purchase', {
        state: { entryId: refId, id: refId, entryNo: t.voucherNo },
      });
      return;
    }

    // 8. Financial Voucher fallback
    if (refType === 'voucher' || vName.includes('voucher')) {
      if (vName.includes('payment')) {
        navigate('/entry/voucher/payment', { state: { voucherId: refId } });
        return;
      }
      if (vName.includes('receipt')) {
        navigate('/entry/voucher/receipt', { state: { voucherId: refId } });
        return;
      }
      if (vName.includes('contra')) {
        navigate('/entry/voucher/contra', { state: { voucherId: refId } });
        return;
      }
      if (vName.includes('journal')) {
        navigate('/entry/voucher/journal', { state: { voucherId: refId } });
        return;
      }
    }
  };

  // Badge styling for transaction types
  const getBadgeStyle = (type: string, name: string) => {
    const t = (type || '').toLowerCase();
    const n = (name || '').toLowerCase();
    if (t === 'purchase' || n.includes('purchase')) {
      return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' }; // Blue
    }
    if (t === 'sales' || n.includes('sales')) {
      return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' }; // Emerald
    }
    if (t === 'purchasereturn' || t === 'salesreturn' || n.includes('return')) {
      return { bg: '#faf5ff', color: '#7e22ce', border: '#e9d5ff' }; // Purple
    }
    if (t === 'damage' || t === 'wastage' || n.includes('damage')) {
      return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }; // Rose
    }
    if (t === 'adjustment' || n.includes('adjustment')) {
      return { bg: '#fffbeb', color: '#b45309', border: '#fde68a' }; // Amber
    }
    if (t === 'opening' || n.includes('opening')) {
      return { bg: '#f0fdfa', color: '#0f766e', border: '#99f6e4' }; // Teal
    }
    return { bg: '#f8fafc', color: '#475569', border: '#e2e8f0' };
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredTransactions.length || !selectedProduct) return;
    const headers = [
      '#',
      'Date',
      'Voucher Type',
      'Voucher No',
      'Party / Detail',
      'Batch/IMEI',
      'Quantity In',
      'Quantity Out',
      'Balance',
      'Rate',
      'Amount',
      'Narration',
    ];
    const rows = filteredTransactions.map((t, idx) => [
      idx + 1,
      t.date ? formatDateDisplay(t.date) : '',
      `"${(t.voucherName || '').replace(/"/g, '""')}"`,
      `"${(t.voucherNo || '').replace(/"/g, '""')}"`,
      `"${(t.partyName || '').replace(/"/g, '""')}"`,
      `"${(t.batchNumber || '').replace(/"/g, '""')}"`,
      t.quantityIn || 0,
      t.quantityOut || 0,
      t.runningBalance || 0,
      t.rate || 0,
      t.amount || 0,
      `"${(t.narration || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const safeName = (selectedProduct.name || 'product').replace(/[^a-z0-9]/gi, '_');
    link.setAttribute('download', `Transaction_Details_${safeName}_${getCurrentDate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print view
  const handlePrint = () => {
    window.print();
  };

  const displayName = data?.product?.name || selectedProduct?.name || '';
  const displayCode = data?.product?.code || data?.product?.sku || selectedProduct?.code || selectedProduct?.sku || '';
  const currentStock = data?.product?.currentStock ?? selectedProduct?.currentStock ?? 0;
  const unit =
    data?.product?.unit ||
    (typeof selectedProduct?.unitOfMeasureId === 'object' && selectedProduct.unitOfMeasureId !== null
      ? selectedProduct.unitOfMeasureId.shortCode || selectedProduct.unitOfMeasureId.name
      : selectedProduct?.unit) ||
    'Pcs';

  // Common date input styling to prevent text clipping and ensure consistent 38px height
  const dateInputSx = {
    width: '175px',
    '& .MuiOutlinedInput-root': {
      height: '38px',
      fontSize: '0.84rem',
      borderRadius: '8px',
      backgroundColor: '#ffffff',
      '& fieldset': {
        borderColor: '#cbd5e1',
      },
      '&:hover fieldset': {
        borderColor: '#94a3b8',
      },
      '&.Mui-focused fieldset': {
        borderColor: '#4f46e5',
        borderWidth: '1.5px',
      },
    },
    '& .MuiInputLabel-root': {
      fontSize: '0.80rem',
      color: '#64748b',
      transform: 'translate(14px, -9px) scale(0.85)',
      backgroundColor: '#ffffff',
      padding: '0 4px',
      '&.Mui-focused': {
        color: '#4f46e5',
      },
    },
    '& .MuiInputBase-input': {
      py: 0,
      px: 1.2,
      fontSize: '0.84rem',
      fontWeight: 600,
      color: '#0f172a',
    },
    '& .MuiIconButton-root': {
      padding: '4px',
      color: '#64748b',
    },
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '100%',
        backgroundColor: '#f1f5f9',
        overflow: 'hidden',
        boxSizing: 'border-box',
        padding: '16px 20px',
        gap: '14px',
      }}
    >
      {/* ── TOP BANNER & PRODUCT COMBOBOX ── */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          padding: '14px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          flexShrink: 0,
        }}
      >
        {/* Left: Window Title & Subtitle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              backgroundColor: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 8px -2px rgba(79, 70, 229, 0.4)',
              flexShrink: 0,
            }}
          >
            <ReceiptIcon sx={{ fontSize: '26px' }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.22rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                Product Transaction Details
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  backgroundColor: '#eef2ff',
                  color: '#4f46e5',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid #c7d2fe',
                }}
              >
                Stock Movement Ledger
              </span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
              Select any product via the combobox to view full transaction history, vouchers &amp; running stock
            </div>
          </div>
        </div>

        {/* Center / Right: PRODUCT COMBOBOX (Autocomplete) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end', minWidth: '320px', maxWidth: '640px' }}>
          <div style={{ flex: 1, minWidth: '280px' }}>
            <Autocomplete
              options={products}
              value={selectedProduct}
              onChange={(_, newValue) => {
                setSelectedProduct(newValue);
              }}
              getOptionLabel={(option) => {
                const code = option.code || option.sku || '';
                return code ? `${option.name} (${code})` : option.name;
              }}
              isOptionEqualToValue={(option, val) => option._id === val?._id}
              loading={loadingProducts}
              filterOptions={(options, state) => {
                const q = state.inputValue.trim().toLowerCase();
                if (!q) return options.slice(0, 80);
                return options
                  .filter((p) => {
                    return (
                      p.name.toLowerCase().includes(q) ||
                      (p.code || '').toLowerCase().includes(q) ||
                      (p.sku || '').toLowerCase().includes(q) ||
                      (p.barcode || '').toLowerCase().includes(q) ||
                      (p.systemBarcode || '').toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 80);
              }}
              renderOption={(props, option) => {
                const code = option.code || option.sku;
                return (
                  <li
                    {...props}
                    key={option._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderBottom: '1px solid #f1f5f9',
                      fontSize: '0.84rem',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {option.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#64748b' }}>
                        {code && (
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 700,
                              backgroundColor: '#f1f5f9',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              color: '#334155',
                            }}
                          >
                            {code}
                          </span>
                        )}
                        {option.category && <span>• {option.category}</span>}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#4f46e5',
                          backgroundColor: '#eef2ff',
                          padding: '2px 8px',
                          borderRadius: '12px',
                        }}
                      >
                        Select
                      </span>
                    </div>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Type or select a product (Name, Code, SKU, Barcode)..."
                  label="Select Product"
                  size="small"
                  InputLabelProps={{
                    shrink: true,
                  }}
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <>
                        <InputAdornment position="start">
                          <ShoppingBagIcon sx={{ color: '#4f46e5', fontSize: '20px' }} />
                        </InputAdornment>
                        {params.InputProps.startAdornment}
                      </>
                    ),
                    endAdornment: (
                      <>
                        {loadingProducts ? <CircularProgress color="inherit" size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      height: '42px',
                      borderRadius: '9px',
                      backgroundColor: '#f8fafc',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      '& fieldset': {
                        borderColor: '#cbd5e1',
                      },
                      '&:hover fieldset': {
                        borderColor: '#6366f1',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#4f46e5',
                        borderWidth: '2px',
                        backgroundColor: '#ffffff',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: '#4f46e5',
                      backgroundColor: '#ffffff',
                      px: 0.6,
                    },
                  }}
                />
              )}
            />
          </div>

          {/* Quick Actions (Export / Print) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tooltip title="Export current list to CSV">
              <span>
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={!selectedProduct || filteredTransactions.length === 0}
                  style={{
                    height: '40px',
                    padding: '0 12px',
                    fontSize: '0.80rem',
                    fontWeight: 700,
                    color: !selectedProduct || filteredTransactions.length === 0 ? '#94a3b8' : '#047857',
                    backgroundColor: !selectedProduct || filteredTransactions.length === 0 ? '#f1f5f9' : '#ecfdf5',
                    border: `1px solid ${!selectedProduct || filteredTransactions.length === 0 ? '#e2e8f0' : '#a7f3d0'}`,
                    borderRadius: '8px',
                    cursor: !selectedProduct || filteredTransactions.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <FileDownloadIcon sx={{ fontSize: '18px' }} />
                  <span>CSV</span>
                </button>
              </span>
            </Tooltip>

            <Tooltip title="Print Report">
              <span>
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={!selectedProduct || filteredTransactions.length === 0}
                  style={{
                    height: '40px',
                    padding: '0 12px',
                    fontSize: '0.80rem',
                    fontWeight: 700,
                    color: !selectedProduct || filteredTransactions.length === 0 ? '#94a3b8' : '#334155',
                    backgroundColor: !selectedProduct || filteredTransactions.length === 0 ? '#f1f5f9' : '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    cursor: !selectedProduct || filteredTransactions.length === 0 ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <PrintIcon sx={{ fontSize: '18px' }} />
                  <span>Print</span>
                </button>
              </span>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      {!selectedProduct ? (
        // Empty state when no product is selected yet
        <div
          style={{
            flex: 1,
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '76px',
              height: '76px',
              borderRadius: '20px',
              backgroundColor: '#eef2ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4f46e5',
              marginBottom: '18px',
              boxShadow: '0 8px 16px -4px rgba(79, 70, 229, 0.15)',
            }}
          >
            <ShoppingBagIcon sx={{ fontSize: '40px' }} />
          </div>

          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
            No Product Selected
          </h3>
          <p style={{ margin: '8px 0 20px', fontSize: '0.86rem', color: '#64748b', maxWidth: '440px', lineHeight: 1.5 }}>
            Please search and select a product using the combobox above to load its complete transaction history, stock adjustments, purchase and sales records.
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>Quick pick from recent:</span>
            {products.slice(0, 4).map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => setSelectedProduct(p)}
                style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '20px',
                  backgroundColor: '#f8fafc',
                  padding: '4px 12px',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#334155',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#eef2ff';
                  e.currentTarget.style.borderColor = '#c7d2fe';
                  e.currentTarget.style.color = '#4f46e5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.color = '#334155';
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        // When a product is selected
        <div
          ref={printAreaRef}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflow: 'hidden',
          }}
        >
          {/* Selected Product Banner Pill */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              padding: '10px 16px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  backgroundColor: '#eef2ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#4f46e5',
                }}
              >
                <CheckCircleIcon sx={{ fontSize: '18px' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    {displayName}
                  </span>
                  {displayCode && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: '4px',
                        backgroundColor: '#f1f5f9',
                        color: '#475569',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      {displayCode}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Current Stock pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 14px',
                borderRadius: '20px',
                backgroundColor: currentStock > 0 ? '#f0fdf4' : currentStock === 0 ? '#fffbeb' : '#fef2f2',
                border: `1px solid ${currentStock > 0 ? '#bbf7d0' : currentStock === 0 ? '#fde68a' : '#fecaca'}`,
              }}
            >
              <span style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 600 }}>Current In-Stock:</span>
              <span
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: currentStock > 0 ? '#15803d' : currentStock === 0 ? '#b45309' : '#b91c1c',
                }}
              >
                {currentStock} {unit}
              </span>
            </div>
          </div>

          {/* ── 1. COMPACT KPI TILES (HALF SIZE) ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            {/* Tile 1: Opening Stock */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                padding: '6px 12px',
                border: '1px solid #e2e8f0',
                borderTop: '2.5px solid #64748b',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minHeight: '46px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Opening Stock
                </span>
                <InventoryIcon sx={{ fontSize: '13px', color: '#64748b' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                <span style={{ fontSize: '1.12rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                  {data ? Number(data.openingBalance).toFixed(2) : '0.00'}
                </span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    padding: '1px 5px',
                    borderRadius: '3px',
                  }}
                >
                  {unit}
                </span>
              </div>
            </div>

            {/* Tile 2: Total In (+) */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                padding: '6px 12px',
                border: '1px solid #bbf7d0',
                borderTop: '2.5px solid #16a34a',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minHeight: '46px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Total Inbound (+)
                </span>
                <TrendingUpIcon sx={{ fontSize: '14px', color: '#16a34a' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                <span style={{ fontSize: '1.12rem', fontWeight: 800, color: '#16a34a', letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                  +{data ? Number(data.totalIn).toFixed(2) : '0.00'}
                </span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    backgroundColor: '#dcfce7',
                    color: '#15803d',
                    padding: '1px 5px',
                    borderRadius: '3px',
                  }}
                >
                  {unit}
                </span>
              </div>
            </div>

            {/* Tile 3: Total Out (-) */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                padding: '6px 12px',
                border: '1px solid #fecaca',
                borderTop: '2.5px solid #dc2626',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minHeight: '46px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Total Outbound (-)
                </span>
                <TrendingDownIcon sx={{ fontSize: '14px', color: '#dc2626' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                <span style={{ fontSize: '1.12rem', fontWeight: 800, color: '#dc2626', letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                  -{data ? Number(data.totalOut).toFixed(2) : '0.00'}
                </span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    backgroundColor: '#fee2e2',
                    color: '#b91c1c',
                    padding: '1px 5px',
                    borderRadius: '3px',
                  }}
                >
                  {unit}
                </span>
              </div>
            </div>

            {/* Tile 4: Closing Balance */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                padding: '6px 12px',
                border: '1px solid #bfdbfe',
                borderTop: '2.5px solid #2563eb',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minHeight: '46px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Closing Balance
                </span>
                <BalanceIcon sx={{ fontSize: '13px', color: '#2563eb' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                <span style={{ fontSize: '1.12rem', fontWeight: 800, color: '#1d4ed8', letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                  {data ? Number(data.closingBalance).toFixed(2) : '0.00'}
                </span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    backgroundColor: '#dbeafe',
                    color: '#1d4ed8',
                    padding: '1px 5px',
                    borderRadius: '3px',
                  }}
                >
                  {unit}
                </span>
              </div>
            </div>

            {/* Tile 5: Entries Count */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                padding: '6px 12px',
                border: '1px solid #e2e8f0',
                borderTop: '2.5px solid #0f172a',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                minHeight: '46px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Transactions
                </span>
                <ReceiptIcon sx={{ fontSize: '13px', color: '#0f172a' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
                <span style={{ fontSize: '1.12rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                  {filteredTransactions.length}
                </span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    padding: '1px 5px',
                    borderRadius: '3px',
                  }}
                >
                  {filteredTransactions.length === 1 ? 'record' : 'records'}
                </span>
              </div>
            </div>
          </div>

          {/* ── 2. REFINED FILTER TOOLBAR ── */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '10px 16px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              flexShrink: 0,
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
            }}
          >
            {/* Top Toolbar Row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              {/* Left: Quick Date Presets & Inputs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {/* Date Preset Segment Control */}
                <div
                  style={{
                    display: 'inline-flex',
                    backgroundColor: '#f1f5f9',
                    padding: '3px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    gap: '2px',
                  }}
                >
                  {[
                    { id: 'today', label: 'Today' },
                    { id: 'thisMonth', label: 'This Month' },
                    { id: 'all', label: 'All Dates' },
                  ].map((p) => {
                    const isActive = activeDatePreset === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePresetSelect(p.id as any)}
                        style={{
                          border: 'none',
                          backgroundColor: isActive ? '#0f172a' : 'transparent',
                          color: isActive ? '#ffffff' : '#475569',
                          fontWeight: isActive ? 700 : 600,
                          fontSize: '0.74rem',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          transition: 'all 0.12s ease',
                          boxShadow: isActive ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                {/* From Date Picker */}
                <DateInput
                  label="From Date"
                  value={fromDate}
                  onChange={(val) => {
                    setFromDate(val);
                    setActiveDatePreset('custom');
                  }}
                  size="small"
                  sx={dateInputSx}
                />

                <ArrowForwardIcon sx={{ fontSize: 16, color: '#94a3b8' }} />

                {/* To Date Picker */}
                <DateInput
                  label="To Date"
                  value={toDate}
                  onChange={(val) => {
                    setToDate(val);
                    setActiveDatePreset('custom');
                  }}
                  size="small"
                  sx={dateInputSx}
                />

                {/* Voucher Type Dropdown with custom chevron */}
                <div style={{ position: 'relative' }}>
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    style={{
                      height: '38px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      color: '#1e293b',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      padding: '0 32px 0 12px',
                      outline: 'none',
                      cursor: 'pointer',
                      appearance: 'none',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <option value="All">All Voucher Types</option>
                    <option value="Purchase">Purchase Invoices</option>
                    <option value="Sales">Sales (POS &amp; B2C)</option>
                    <option value="SalesReturn">Sales Returns</option>
                    <option value="PurchaseReturn">Purchase Returns</option>
                    <option value="Adjustment">Stock Adjustments</option>
                    <option value="Damage">Damage &amp; Wastage</option>
                    <option value="Opening">Opening Purchase</option>
                  </select>
                  <div
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      pointerEvents: 'none',
                      color: '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                {/* ── CUSTOMER / SUPPLIER FILTER BUTTON (Opens Filter Window) ── */}
                <Tooltip title="Filter by Customer or Supplier">
                  <button
                    type="button"
                    onClick={() => setPartyFilterOpen(true)}
                    style={{
                      height: '38px',
                      padding: '0 12px',
                      fontSize: '0.80rem',
                      fontWeight: 700,
                      color: isPartyFilterActive ? '#ffffff' : '#334155',
                      backgroundColor: isPartyFilterActive ? '#4f46e5' : '#ffffff',
                      border: `1px solid ${isPartyFilterActive ? '#4f46e5' : '#cbd5e1'}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                      boxShadow: isPartyFilterActive ? '0 2px 6px rgba(79, 70, 229, 0.3)' : 'none',
                    }}
                  >
                    <FilterAltIcon sx={{ fontSize: '17px' }} />
                    <span>Customer / Supplier Filter</span>
                    {isPartyFilterActive && (
                      <span
                        style={{
                          backgroundColor: '#ffffff',
                          color: '#4f46e5',
                          borderRadius: '10px',
                          padding: '1px 6px',
                          fontSize: '0.68rem',
                          fontWeight: 800,
                        }}
                      >
                        {(filterByCustomer ? 1 : 0) + (filterBySupplier ? 1 : 0)} Active
                      </span>
                    )}
                  </button>
                </Tooltip>
              </div>

              {/* Right: Search & Refresh */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ position: 'relative', width: '230px' }}>
                  <SearchIcon
                    sx={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#94a3b8',
                      fontSize: '18px',
                      pointerEvents: 'none',
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Search voucher, party..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      paddingLeft: '32px',
                      paddingRight: '12px',
                      fontSize: '0.80rem',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.15s ease',
                    }}
                  />
                </div>

                <Tooltip title="Refresh transactions list">
                  <button
                    type="button"
                    onClick={loadTransactions}
                    disabled={loadingTransactions}
                    style={{
                      height: '38px',
                      padding: '0 12px',
                      fontSize: '0.80rem',
                      fontWeight: 600,
                      color: '#334155',
                      backgroundColor: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <RefreshIcon sx={{ fontSize: '17px', color: '#64748b' }} />
                    <span>Refresh</span>
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Active Party Filter Chips (Displayed when Customer or Supplier filter is active) */}
            {isPartyFilterActive && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  paddingTop: '6px',
                  borderTop: '1px dashed #e2e8f0',
                }}
              >
                <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700 }}>
                  Active Party Filters:
                </span>

                {filterByCustomer && (
                  <Chip
                    size="small"
                    icon={<PersonIcon sx={{ fontSize: '15px !important', color: '#047857 !important' }} />}
                    label={
                      <span>
                        Customer: <strong>{selectedCustomer ? selectedCustomer.name : 'All Customers'}</strong>
                      </span>
                    }
                    onDelete={handleClearCustomerFilter}
                    deleteIcon={<CloseIcon sx={{ fontSize: '14px !important' }} />}
                    sx={{
                      backgroundColor: '#ecfdf5',
                      color: '#047857',
                      border: '1px solid #a7f3d0',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      height: '26px',
                      '& .MuiChip-deleteIcon': {
                        color: '#059669',
                        '&:hover': { color: '#047857' },
                      },
                    }}
                  />
                )}

                {filterBySupplier && (
                  <Chip
                    size="small"
                    icon={<BusinessIcon sx={{ fontSize: '15px !important', color: '#1d4ed8 !important' }} />}
                    label={
                      <span>
                        Supplier: <strong>{selectedSupplier ? selectedSupplier.name : 'All Suppliers'}</strong>
                      </span>
                    }
                    onDelete={handleClearSupplierFilter}
                    deleteIcon={<CloseIcon sx={{ fontSize: '14px !important' }} />}
                    sx={{
                      backgroundColor: '#eff6ff',
                      color: '#1d4ed8',
                      border: '1px solid #bfdbfe',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      height: '26px',
                      '& .MuiChip-deleteIcon': {
                        color: '#2563eb',
                        '&:hover': { color: '#1d4ed8' },
                      },
                    }}
                  />
                )}

                <button
                  type="button"
                  onClick={handleResetPartyFilters}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#dc2626',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: '2px 4px',
                  }}
                >
                  Reset Party Filters
                </button>
              </div>
            )}
          </div>

          {/* ── 3. CLEAN TRANSACTIONS TABLE ── */}
          <div
            style={{
              flex: 1,
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1 }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.75rem',
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: '#f8fafc',
                      color: '#475569',
                      borderBottom: '1px solid #e2e8f0',
                      position: 'sticky',
                      top: 0,
                      zIndex: 2,
                    }}
                  >
                    <th style={{ padding: '10px 12px', width: '38px', textAlign: 'center', fontWeight: 700 }}>#</th>
                    <th style={{ padding: '10px 12px', width: '92px', fontWeight: 700 }}>Date</th>
                    <th style={{ padding: '10px 12px', width: '135px', fontWeight: 700 }}>Voucher Type</th>
                    <th style={{ padding: '10px 12px', width: '125px', fontWeight: 700 }}>Voucher No</th>
                    <th style={{ padding: '10px 12px', width: '185px', fontWeight: 700 }}>Party / Detail</th>
                    <th style={{ padding: '10px 12px', width: '105px', fontWeight: 700 }}>Batch / IMEI</th>
                    <th style={{ padding: '10px 12px', width: '85px', textAlign: 'right', fontWeight: 700 }}>In (+)</th>
                    <th style={{ padding: '10px 12px', width: '85px', textAlign: 'right', fontWeight: 700 }}>Out (-)</th>
                    <th style={{ padding: '10px 12px', width: '95px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                      Balance
                    </th>
                    <th style={{ padding: '10px 12px', width: '85px', textAlign: 'right', fontWeight: 700 }}>Rate</th>
                    <th style={{ padding: '10px 12px', width: '95px', textAlign: 'right', fontWeight: 700 }}>Amount</th>
                    <th style={{ padding: '10px 12px', minWidth: '130px', fontWeight: 700 }}>Narration</th>
                    <th style={{ padding: '10px 12px', width: '65px', textAlign: 'center', fontWeight: 700 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingTransactions ? (
                    <tr>
                      <td colSpan={13} style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                        <CircularProgress size={26} sx={{ color: '#4f46e5', mb: 1 }} />
                        <div style={{ fontSize: '0.80rem', fontWeight: 600 }}>Loading transactions history...</div>
                      </td>
                    </tr>
                  ) : error ? (
                    <tr>
                      <td colSpan={13} style={{ textAlign: 'center', padding: '36px', color: '#ef4444', fontWeight: 600 }}>
                        {error}
                      </td>
                    </tr>
                  ) : filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={13} style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
                        <div style={{ fontSize: '1.8rem', marginBottom: '8px' }}>📄</div>
                        <div style={{ fontWeight: 700, color: '#334155', fontSize: '0.86rem' }}>
                          No transactions found for the selected criteria.
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '4px' }}>
                          {isPartyFilterActive
                            ? 'Try clearing the Customer or Supplier filter to see more transactions.'
                            : 'Click "All Dates" to view complete transaction history.'}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((t, idx) => {
                      const badge = getBadgeStyle(t.type, t.voucherName);
                      const isIn = (t.quantityIn ?? 0) > 0;
                      const isOut = (t.quantityOut ?? 0) > 0;

                      return (
                        <tr
                          key={t.id || idx}
                          onDoubleClick={() => handleOpenVoucher(t)}
                          title="Double-click to open voucher document"
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            cursor: 'pointer',
                            transition: 'background-color 0.12s ease',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#f8fafc';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          {/* # */}
                          <td style={{ padding: '9px 12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600 }}>
                            {idx + 1}
                          </td>

                          {/* Date */}
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
                            {t.date ? formatDateDisplay(t.date) : '-'}
                          </td>

                          {/* Voucher Type */}
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '5px',
                                fontSize: '0.70rem',
                                fontWeight: 700,
                                backgroundColor: badge.bg,
                                color: badge.color,
                                border: `1px solid ${badge.border}`,
                              }}
                            >
                              {t.voucherName}
                            </span>
                          </td>

                          {/* Voucher No */}
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontWeight: 700,
                                fontSize: '0.74rem',
                                color: '#0f172a',
                              }}
                            >
                              {t.voucherNo || '-'}
                            </span>
                          </td>

                          {/* Party / Detail with party type chip */}
                          <td
                            style={{
                              padding: '9px 12px',
                              color: '#334155',
                              maxWidth: '185px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              fontWeight: 500,
                            }}
                            title={t.partyName || '-'}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              {t.partyType === 'Customer' ? (
                                <PersonIcon sx={{ fontSize: '13px', color: '#047857', flexShrink: 0 }} />
                              ) : t.partyType === 'Supplier' ? (
                                <BusinessIcon sx={{ fontSize: '13px', color: '#1d4ed8', flexShrink: 0 }} />
                              ) : null}
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.partyName || '-'}
                              </span>
                            </div>
                          </td>

                          {/* Batch / IMEI */}
                          <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontFamily: 'monospace', color: '#64748b' }}>
                            {t.batchNumber || '-'}
                          </td>

                          {/* In (+) */}
                          <td
                            style={{
                              padding: '9px 12px',
                              textAlign: 'right',
                              fontWeight: 700,
                              color: isIn ? '#16a34a' : '#cbd5e1',
                            }}
                          >
                            {isIn ? `+${Number(t.quantityIn).toFixed(2)}` : '—'}
                          </td>

                          {/* Out (-) */}
                          <td
                            style={{
                              padding: '9px 12px',
                              textAlign: 'right',
                              fontWeight: 700,
                              color: isOut ? '#dc2626' : '#cbd5e1',
                            }}
                          >
                            {isOut ? `-${Number(t.quantityOut).toFixed(2)}` : '—'}
                          </td>

                          {/* Running Balance */}
                          <td
                            style={{
                              padding: '9px 12px',
                              textAlign: 'right',
                              fontWeight: 800,
                              color: '#0f172a',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {Number(t.runningBalance).toFixed(2)}
                          </td>

                          {/* Rate */}
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#64748b', fontWeight: 500 }}>
                            {Number(t.rate ?? 0).toFixed(2)}
                          </td>

                          {/* Amount */}
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#0f172a', fontWeight: 700 }}>
                            {Number(t.amount ?? 0).toFixed(2)}
                          </td>

                          {/* Narration */}
                          <td
                            style={{
                              padding: '9px 12px',
                              color: '#64748b',
                              fontSize: '0.72rem',
                              maxWidth: '190px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={t.narration || ''}
                          >
                            {t.narration || '—'}
                          </td>

                          {/* Action */}
                          <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                            <Tooltip title="Open voucher document (or double-click row)">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenVoucher(t);
                                }}
                                style={{
                                  border: '1px solid #e2e8f0',
                                  backgroundColor: '#ffffff',
                                  color: '#475569',
                                  borderRadius: '5px',
                                  padding: '3px 7px',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3px',
                                  transition: 'all 0.12s ease',
                                }}
                              >
                                <span>Open</span>
                                <OpenInNewIcon sx={{ fontSize: '11px' }} />
                              </button>
                            </Tooltip>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ── FOOTER HINT ── */}
            <div
              style={{
                padding: '9px 16px',
                backgroundColor: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.74rem',
                color: '#64748b',
              }}
            >
              <span>
                💡 <strong>Double-click</strong> any row to open and inspect that voucher directly.
              </span>
              <span style={{ fontWeight: 600 }}>
                Showing {filteredTransactions.length} of {data?.transactions?.length ?? 0} entries
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. SMALL FILTER WINDOW (Customer / Supplier Modal) ── */}
      <Dialog
        open={partyFilterOpen}
        onClose={() => setPartyFilterOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '14px',
            overflow: 'hidden',
            p: 0,
            boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.18)',
          },
        }}
      >
        <DialogTitle
          sx={{
            m: 0,
            px: 2.5,
            py: 1.75,
            bgcolor: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                backgroundColor: '#eef2ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4f46e5',
              }}
            >
              <FilterAltIcon sx={{ fontSize: '20px' }} />
            </div>
            <div>
              <div style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                Filter by Party
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Select Customer or Supplier to narrow transactions
              </div>
            </div>
          </div>

          <IconButton
            size="small"
            onClick={() => setPartyFilterOpen(false)}
            sx={{ color: '#94a3b8', '&:hover': { color: '#0f172a', bgcolor: '#f1f5f9' } }}
          >
            <CloseIcon sx={{ fontSize: '19px' }} />
          </IconButton>
        </DialogTitle>

        <DialogContent
          sx={{
            p: 2.5,
            backgroundColor: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {/* Section 1: Customer Checkbox & Combobox */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              padding: '12px 14px',
              border: `1.5px solid ${filterByCustomer ? '#059669' : '#e2e8f0'}`,
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              transition: 'border-color 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: filterByCustomer ? '10px' : 0 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filterByCustomer}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFilterByCustomer(checked);
                      if (!checked) {
                        setSelectedCustomer(null);
                      }
                    }}
                    sx={{
                      color: '#059669',
                      '&.Mui-checked': { color: '#059669' },
                      p: 0.5,
                    }}
                  />
                }
                label={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <PersonIcon sx={{ fontSize: '17px', color: '#059669' }} />
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                      Filter by Customer
                    </span>
                  </div>
                }
                sx={{ m: 0 }}
              />

              {filterByCustomer && selectedCustomer && (
                <button
                  type="button"
                  onClick={() => setSelectedCustomer(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#dc2626',
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Clear Selection
                </button>
              )}
            </div>

            {filterByCustomer && (
              <div style={{ marginTop: '8px' }}>
                <Autocomplete
                  options={customers}
                  value={selectedCustomer}
                  onChange={(_, val) => setSelectedCustomer(val)}
                  getOptionLabel={(option) => {
                    const code = option.code ? ` (${option.code})` : '';
                    return `${option.name}${code}`;
                  }}
                  isOptionEqualToValue={(opt, val) => opt._id === val?._id}
                  loading={loadingParties}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      placeholder="Search / select a customer (or leave blank for all customers)..."
                      label="Select Customer"
                      InputLabelProps={{ shrink: true }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          fontSize: '0.82rem',
                          borderRadius: '8px',
                          backgroundColor: '#f8fafc',
                        },
                      }}
                    />
                  )}
                />
                <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: '4px' }}>
                  {selectedCustomer
                    ? `Filtering sales to: ${selectedCustomer.name}`
                    : 'Leaving empty includes all customers (Sales & Sales Returns)'}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Supplier Checkbox & Combobox */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              padding: '12px 14px',
              border: `1.5px solid ${filterBySupplier ? '#2563eb' : '#e2e8f0'}`,
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              transition: 'border-color 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: filterBySupplier ? '10px' : 0 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filterBySupplier}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFilterBySupplier(checked);
                      if (!checked) {
                        setSelectedSupplier(null);
                      }
                    }}
                    sx={{
                      color: '#2563eb',
                      '&.Mui-checked': { color: '#2563eb' },
                      p: 0.5,
                    }}
                  />
                }
                label={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BusinessIcon sx={{ fontSize: '17px', color: '#2563eb' }} />
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                      Filter by Supplier
                    </span>
                  </div>
                }
                sx={{ m: 0 }}
              />

              {filterBySupplier && selectedSupplier && (
                <button
                  type="button"
                  onClick={() => setSelectedSupplier(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#dc2626',
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Clear Selection
                </button>
              )}
            </div>

            {filterBySupplier && (
              <div style={{ marginTop: '8px' }}>
                <Autocomplete
                  options={suppliers}
                  value={selectedSupplier}
                  onChange={(_, val) => setSelectedSupplier(val)}
                  getOptionLabel={(option) => {
                    const code = option.code ? ` (${option.code})` : '';
                    return `${option.name}${code}`;
                  }}
                  isOptionEqualToValue={(opt, val) => opt._id === val?._id}
                  loading={loadingParties}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      size="small"
                      placeholder="Search / select a supplier (or leave blank for all suppliers)..."
                      label="Select Supplier"
                      InputLabelProps={{ shrink: true }}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          fontSize: '0.82rem',
                          borderRadius: '8px',
                          backgroundColor: '#f8fafc',
                        },
                      }}
                    />
                  )}
                />
                <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: '4px' }}>
                  {selectedSupplier
                    ? `Filtering purchases to: ${selectedSupplier.name}`
                    : 'Leaving empty includes all suppliers (Purchases & Returns)'}
                </div>
              </div>
            )}
          </div>
        </DialogContent>

        <DialogActions
          sx={{
            px: 2.5,
            py: 1.5,
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <button
            type="button"
            onClick={handleResetPartyFilters}
            disabled={!isPartyFilterActive}
            style={{
              border: 'none',
              background: 'transparent',
              color: isPartyFilterActive ? '#dc2626' : '#cbd5e1',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: isPartyFilterActive ? 'pointer' : 'default',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <ClearIcon sx={{ fontSize: '15px' }} />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={() => setPartyFilterOpen(false)}
            style={{
              padding: '6px 18px',
              fontSize: '0.82rem',
              fontWeight: 700,
              color: '#ffffff',
              backgroundColor: '#4f46e5',
              border: 'none',
              borderRadius: '7px',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(79, 70, 229, 0.3)',
            }}
          >
            Apply &amp; View
          </button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
