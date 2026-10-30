import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Close as CloseIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon,
  OpenInNew as OpenInNewIcon,
  ReceiptLong as ReceiptIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AccountBalanceWallet as BalanceIcon,
  Inventory as InventoryIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useAppSelector } from '../store/hooks';
import {
  stockApi,
  ProductTransactionDetail,
  ProductTransactionsResponse,
} from '../services/api';
import DateInput, { getCurrentDate, formatDateDisplay } from './DateInput';

interface ProductTransactionsModalProps {
  open: boolean;
  onClose: () => void;
  productId: string | null;
  productName?: string;
  productCode?: string;
}

export default function ProductTransactionsModal({
  open,
  onClose,
  productId,
  productName,
  productCode,
}: ProductTransactionsModalProps) {
  const navigate = useNavigate();
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  // Date filters: default to current date
  const [fromDate, setFromDate] = useState<string>(getCurrentDate());
  const [toDate, setToDate] = useState<string>(getCurrentDate());
  const [activeDatePreset, setActiveDatePreset] = useState<'today' | 'thisMonth' | 'all' | 'custom'>('today');

  // Filter & Search
  const [selectedType, setSelectedType] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data state
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ProductTransactionsResponse | null>(null);

  // Fetch transactions from backend
  const loadTransactions = useCallback(async () => {
    if (!open || !productId || !companyId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await stockApi.getProductTransactions(productId, companyId, {
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
      setLoading(false);
    }
  }, [open, productId, companyId, financialYearId, fromDate, toDate, selectedType]);

  // Reset to current date whenever opened for a product
  useEffect(() => {
    if (open && productId) {
      const today = getCurrentDate();
      setFromDate(today);
      setToDate(today);
      setActiveDatePreset('today');
      setSelectedType('All');
      setSearchQuery('');
    }
  }, [open, productId]);

  // Trigger reload on dependencies change
  useEffect(() => {
    if (open && productId && companyId) {
      loadTransactions();
    }
  }, [open, productId, companyId, fromDate, toDate, selectedType, loadTransactions]);

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

  // Local table search filter
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    if (!searchQuery.trim()) return data.transactions;
    const q = searchQuery.trim().toLowerCase();
    return data.transactions.filter((t) => {
      return (
        (t.voucherNo || '').toLowerCase().includes(q) ||
        (t.voucherName || '').toLowerCase().includes(q) ||
        (t.partyName || '').toLowerCase().includes(q) ||
        (t.narration || '').toLowerCase().includes(q) ||
        (t.batchNumber || '').toLowerCase().includes(q) ||
        (t.type || '').toLowerCase().includes(q)
      );
    });
  }, [data?.transactions, searchQuery]);

  // Double-click navigation to voucher document
  const handleOpenVoucher = (t: ProductTransactionDetail) => {
    const type = (t.type || '').toLowerCase();
    const vName = (t.voucherName || '').toLowerCase();
    const vNo = (t.voucherNo || '').toUpperCase();
    const refType = (t.referenceType || '').toLowerCase();
    const refId = t.referenceId;
    const invType = t.invoiceType;

    onClose();

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

  // Badge styling for transaction types in the table
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

  const displayName = data?.product?.name || productName || 'Product Transactions';
  const displayCode = data?.product?.code || data?.product?.sku || productCode || '';
  const currentStock = data?.product?.currentStock ?? 0;
  const unit = data?.product?.unit || 'Pcs';

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
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          width: '96vw',
          maxWidth: '1380px',
          height: '92vh',
          maxHeight: '920px',
          borderRadius: '14px',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#f8fafc',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
          overflow: 'hidden',
        },
      }}
    >
      {/* ── TOP HEADER ── */}
      <DialogTitle
        sx={{
          m: 0,
          px: 3,
          py: 1.75,
          bgcolor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              backgroundColor: '#eef2ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4f46e5',
              flexShrink: 0,
            }}
          >
            <ReceiptIcon sx={{ fontSize: '22px' }} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '560px',
                  letterSpacing: '-0.01em',
                }}
              >
                {displayName}
              </span>
              {displayCode && (
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '5px',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  {displayCode}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              Product Transaction History &amp; Stock Movement Ledger
            </div>
          </div>
        </div>

        {/* Right side of header: Available stock + Refresh + Close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 14px',
              borderRadius: '20px',
              backgroundColor: currentStock > 0 ? '#f0fdf4' : currentStock === 0 ? '#fffbeb' : '#fef2f2',
              border: `1px solid ${currentStock > 0 ? '#bbf7d0' : currentStock === 0 ? '#fde68a' : '#fecaca'}`,
            }}
          >
            <span style={{ fontSize: '0.74rem', color: '#475569', fontWeight: 600 }}>In Stock:</span>
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

          <Tooltip title="Refresh transactions">
            <IconButton
              size="small"
              onClick={loadTransactions}
              disabled={loading}
              sx={{ color: '#64748b', '&:hover': { color: '#0f172a', bgcolor: '#f1f5f9' } }}
            >
              <RefreshIcon sx={{ fontSize: '19px' }} />
            </IconButton>
          </Tooltip>

          <IconButton
            size="small"
            onClick={onClose}
            sx={{ color: '#94a3b8', '&:hover': { color: '#0f172a', bgcolor: '#f1f5f9' } }}
          >
            <CloseIcon sx={{ fontSize: '20px' }} />
          </IconButton>
        </div>
      </DialogTitle>

      {/* ── MODAL BODY ── */}
      <DialogContent
        sx={{
          p: 2.5,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden',
          backgroundColor: '#f8fafc',
          gap: 2,
        }}
      >
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
            padding: '12px 16px',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            flexShrink: 0,
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
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

            {/* From Date Picker (width 175px ensures full DD-MM-YYYY is visible without clipping) */}
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

            {/* To Date Picker (width 175px ensures full DD-MM-YYYY is visible without clipping) */}
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
                disabled={loading}
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
                  <th style={{ padding: '10px 12px', width: '175px', fontWeight: 700 }}>Party / Detail</th>
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
                {loading ? (
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
                        No transactions found for the selected dates.
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '4px' }}>
                        Click &ldquo;All Dates&rdquo; to view complete transaction history.
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

                        {/* Party / Detail */}
                        <td
                          style={{
                            padding: '9px 12px',
                            color: '#334155',
                            maxWidth: '175px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontWeight: 500,
                          }}
                          title={t.partyName || '-'}
                        >
                          {t.partyName || '-'}
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
      </DialogContent>
    </Dialog>
  );
}
