import { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../store/hooks';
import { ledgerAccountApi } from '../services/api';

interface Customer {
  _id: string;
  code: string;
  name: string;
  mobile?: string;
  phone?: string;
  address?: string;
  email?: string;
  creditLimit?: number;
  creditDays?: number;
  closingBalance?: number;
  closingIsDebit?: boolean;
  outstandingBalance?: number;
}

const AVATAR_PALETTE = [
  { tint: '#E3EAFF', ink: '#2442B8' },
  { tint: '#DDF3EE', ink: '#0B5E55' },
  { tint: '#F0E6FF', ink: '#5B2CB0' },
  { tint: '#FFE9DA', ink: '#9A3A0B' },
  { tint: '#FEE2E2', ink: '#991B1B' },
  { tint: '#FEF3C7', ink: '#92400E' },
  { tint: '#E0E7FF', ink: '#3730A3' },
  { tint: '#ECFDF5', ink: '#065F46' },
  { tint: '#FCE7F3', ink: '#9D174D' },
  { tint: '#E0F2FE', ink: '#0369A1' },
];

function getAvatarColors(name: string) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[index];
}

export default function CustomerList() {
  const navigate = useNavigate();
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState<string>('');

  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [successDialogMessage, setSuccessDialogMessage] = useState('');

  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorDialogMessage, setErrorDialogMessage] = useState('');

  const fetchCustomers = () => {
    if (!companyId) return;
    setLoading(true);
    const searchTerm = search.trim() || undefined;
    ledgerAccountApi
      .list(companyId, 'Customer', searchTerm, financialYearId || undefined)
      .then((res) => {
        setCustomers((res.data.data as Customer[]) ?? []);
      })
      .catch((err) => {
        console.error('Failed to load customers:', err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomers();
  }, [companyId, search, financialYearId]);

  useEffect(() => {
    const onWindowActivated = (e: any) => {
      const p = e.detail?.path;
      if (p === '/report/customer-list' || p === '/master/customer-create') {
        fetchCustomers();
      }
    };
    const onDatabaseUpdated = () => {
      if (window.location.hash.includes('/report/customer-list') || window.location.pathname.includes('/report/customer-list')) {
        fetchCustomers();
      }
    };
    window.addEventListener('app:window-activated', onWindowActivated);
    window.addEventListener('app:ledgers-updated', onWindowActivated);
    window.addEventListener('app:database-updated', onDatabaseUpdated);
    return () => {
      window.removeEventListener('app:window-activated', onWindowActivated);
      window.removeEventListener('app:ledgers-updated', onWindowActivated);
      window.removeEventListener('app:database-updated', onDatabaseUpdated);
    };
  }, [companyId, search, financialYearId]);

  const handleDelete = (id: string, name: string) => {
    setDeleteTargetId(id);
    setDeleteTargetName(name);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!companyId || !deleteTargetId) return;
    try {
      await ledgerAccountApi.delete(deleteTargetId, companyId);
      setCustomers((prev) => prev.filter((c) => c._id !== deleteTargetId));
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
      setSuccessDialogMessage('Customer deleted successfully');
      setSuccessDialogOpen(true);
    } catch (e: any) {
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
      const msg = e?.response?.data?.message || 'Failed to delete customer';
      setErrorDialogMessage(msg);
      setErrorDialogOpen(true);
    }
  };

  // Calculate totals for quick summary
  const totalReceivable = useMemo(() => {
    return customers.reduce((sum, c) => {
      if (c.closingIsDebit && (c.closingBalance || 0) > 0) {
        return sum + (c.closingBalance || 0);
      }
      return sum;
    }, 0);
  }, [customers]);

  if (!companyId) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error" sx={{ fontWeight: 600 }}>
          Please select a company first to view customers.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100%',
        boxSizing: 'border-box',
        backgroundColor: '#F4F5F8',
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
        color: '#14181F',
        p: { xs: 2, sm: 3, md: '24px 32px 32px' },
      }}
    >
      <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Header Section */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 2,
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography
              component="h1"
              sx={{
                margin: 0,
                fontSize: { xs: '26px', sm: '32px' },
                lineHeight: 1.15,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: '#14181F',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Customer List
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: '15px', color: '#5B6472' }}>
                {customers.length} {customers.length === 1 ? 'customer' : 'customers'}
              </Typography>
              {totalReceivable > 0 && (
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: 1.5,
                    py: 0.25,
                    borderRadius: '12px',
                    bgcolor: '#ECFDF5',
                    border: '1px solid #D1FAE5',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#059669',
                  }}
                >
                  <span>Total Receivable:</span>
                  <span>
                    AED {totalReceivable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </Box>
              )}
            </Box>
          </Box>

          <Button
            type="button"
            onClick={() => navigate('/master/customer-create')}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              height: 44,
              px: 2.5,
              border: 0,
              borderRadius: '10px',
              backgroundColor: '#2F54EB',
              color: '#FFFFFF',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '15px',
              fontWeight: 600,
              textTransform: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(47, 84, 235, 0.2)',
              '&:hover': {
                backgroundColor: '#1D39C4',
                boxShadow: '0 4px 8px rgba(47, 84, 235, 0.3)',
              },
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2.2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add customer
          </Button>
        </Box>

        {/* Main Card Container */}
        <Box
          sx={{
            background: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: '0 1px 2px rgba(20,24,31,0.06), 0 8px 24px rgba(20,24,31,0.04)',
            border: '1px solid #E8EBF1',
            overflow: 'hidden',
          }}
        >
          {/* Toolbar / Search Bar */}
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              padding: '20px 24px',
            }}
          >
            <Box sx={{ position: 'relative', flex: '1 1 320px', maxWidth: 440 }}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#7A8494"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
                style={{ position: 'absolute', left: 14, top: 12, pointerEvents: 'none' }}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
              <input
                id="search-customer"
                type="text"
                placeholder="Search by name or code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  height: 44,
                  padding: '0 36px 0 44px',
                  border: '1px solid #D7DCE5',
                  borderRadius: 10,
                  backgroundColor: '#F9FAFC',
                  fontFamily: 'inherit',
                  fontSize: 15,
                  color: '#14181F',
                  outline: 'none',
                  transition: 'border-color 0.15s ease, background-color 0.15s ease',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#2F54EB';
                  e.currentTarget.style.backgroundColor = '#FFFFFF';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#D7DCE5';
                  e.currentTarget.style.backgroundColor = '#F9FAFC';
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: 13,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#7A8494',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Clear search"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <button
                type="button"
                onClick={fetchCustomers}
                title="Refresh customer list"
                style={{
                  height: 40,
                  padding: '0 14px',
                  borderRadius: 8,
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  color: '#475569',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F8FAFC')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#FFFFFF')}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                Refresh
              </button>
            </Box>
          </Box>

          {/* Table */}
          <Box sx={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 780, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#F6F7FA', textAlign: 'left' }}>
                  <th style={{ padding: '12px 12px 12px 24px', width: 48, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5B6472', borderTop: '1px solid #E8EBF1', borderBottom: '1px solid #E8EBF1' }}>
                    Sl
                  </th>
                  <th style={{ padding: 12, width: 120, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5B6472', borderTop: '1px solid #E8EBF1', borderBottom: '1px solid #E8EBF1' }}>
                    Code
                  </th>
                  <th style={{ padding: 12, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5B6472', borderTop: '1px solid #E8EBF1', borderBottom: '1px solid #E8EBF1' }}>
                    Name
                  </th>
                  <th style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5B6472', borderTop: '1px solid #E8EBF1', borderBottom: '1px solid #E8EBF1', textAlign: 'right' }}>
                    Outstanding Balance
                  </th>
                  <th style={{ padding: 12, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5B6472', borderTop: '1px solid #E8EBF1', borderBottom: '1px solid #E8EBF1', textAlign: 'right' }}>
                    Credit Limit
                  </th>
                  <th style={{ padding: 12, fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5B6472', borderTop: '1px solid #E8EBF1', borderBottom: '1px solid #E8EBF1', textAlign: 'center' }}>
                    Credit Days
                  </th>
                  <th style={{ padding: '12px 24px 12px 12px', width: 110, textAlign: 'right', fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#5B6472', borderTop: '1px solid #E8EBF1', borderBottom: '1px solid #E8EBF1' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '48px 24px', textAlign: 'center', color: '#5B6472' }}>
                      <CircularProgress size={32} sx={{ color: '#2F54EB', mb: 1 }} />
                      <div style={{ fontSize: 14 }}>Loading customer list...</div>
                    </td>
                  </tr>
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '48px 24px', textAlign: 'center', color: '#5B6472', fontSize: 15 }}>
                      {search ? 'No customers match your search.' : 'No customers found. Click "Add customer" to create one.'}
                    </td>
                  </tr>
                ) : (
                  customers.map((c, i) => {
                    const avatar = getAvatarColors(c.name);
                    const initial = c.name ? c.name.trim().charAt(0).toUpperCase() : '?';
                    const hasBal = typeof c.closingBalance === 'number' && c.closingBalance > 0.001;

                    return (
                      <tr
                        key={c._id}
                        onDoubleClick={() => {
                          const today = new Date().toISOString().split('T')[0];
                          navigate('/report/ledger', {
                            state: {
                              accountId: c._id,
                              fromDate: today,
                              toDate: today,
                            },
                          });
                        }}
                        title="Double-click to view ledger report"
                        style={{
                          borderBottom: '1px solid #EEF0F4',
                          transition: 'background-color 0.15s ease',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F5F8FF')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        {/* Sl */}
                        <td style={{ padding: '14px 12px 14px 24px', color: '#5B6472', fontSize: 14 }}>
                          {i + 1}
                        </td>

                        {/* Code */}
                        <td style={{ padding: '14px 12px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: '#EEF1F8',
                              fontSize: 13,
                              fontWeight: 600,
                              color: '#2B3550',
                            }}
                          >
                            {c.code}
                          </span>
                        </td>

                        {/* Name with Avatar */}
                        <td style={{ padding: '14px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div
                              style={{
                                width: 36,
                                height: 36,
                                borderRadius: 18,
                                background: avatar.tint,
                                color: avatar.ink,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                              aria-hidden="true"
                            >
                              {initial}
                            </div>
                            <span style={{ fontWeight: 600, color: '#14181F', fontSize: 14 }}>
                              {c.name}
                            </span>
                          </div>
                        </td>

                        {/* Outstanding Balance (both Dr and Cr in green as requested) */}
                        <td style={{ padding: '14px 14px', textAlign: 'right' }}>
                          {hasBal ? (
                            c.closingIsDebit ? (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  backgroundColor: '#ECFDF5',
                                  color: '#059669',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  border: '1px solid #D1FAE5',
                                }}
                                title="Customer owes money (Debit balance)"
                              >
                                AED {c.closingBalance!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Dr
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  backgroundColor: '#ECFDF5',
                                  color: '#059669',
                                  fontSize: 13,
                                  fontWeight: 700,
                                  border: '1px solid #D1FAE5',
                                }}
                                title="Advance received / credit balance"
                              >
                                AED {c.closingBalance!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr
                              </span>
                            )
                          ) : (
                            <span style={{ color: '#98A1AF', fontSize: 13, fontWeight: 500 }}>
                              AED 0.00
                            </span>
                          )}
                        </td>

                        {/* Credit Limit */}
                        <td style={{ padding: '14px 12px', textAlign: 'right', color: c.creditLimit ? '#334155' : '#98A1AF', fontSize: 13, fontWeight: 500 }}>
                          {c.creditLimit !== undefined && c.creditLimit !== null && Number(c.creditLimit) > 0
                            ? `AED ${Number(c.creditLimit).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>

                        {/* Credit Days */}
                        <td style={{ padding: '14px 12px', textAlign: 'center', color: c.creditDays ? '#334155' : '#98A1AF', fontSize: 13 }}>
                          {c.creditDays ? `${c.creditDays} days` : '—'}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '8px 24px 8px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                            {/* Edit Button */}
                            <button
                              type="button"
                              aria-label={`Edit ${c.name}`}
                              title={`Edit ${c.name}`}
                              onClick={() => navigate(`/master/customer-create?edit=${c._id}`)}
                              style={{
                                width: 38,
                                height: 38,
                                border: 0,
                                borderRadius: 8,
                                background: 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#EEF1F6')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#2F54EB"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" />
                                <path d="M14 6l4 4" />
                              </svg>
                            </button>

                            {/* Delete Button */}
                            <button
                              type="button"
                              aria-label={`Delete ${c.name}`}
                              title={`Delete ${c.name}`}
                              onClick={() => handleDelete(c._id, c.name)}
                              style={{
                                width: 38,
                                height: 38,
                                border: 0,
                                borderRadius: 8,
                                background: 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'background-color 0.15s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FDECEC')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#C62828"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M4 7h16" />
                                <path d="M9 7V4h6v3" />
                                <path d="M6 7l1 13h10l1-13" />
                                <path d="M10 11v6M14 11v6" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </Box>

          {/* Footer */}
          <Box
            sx={{
              padding: '16px 24px',
              fontSize: '14px',
              color: '#5B6472',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1.5,
              borderTop: '1px solid #EEF0F4',
              backgroundColor: '#FAFBFC',
            }}
          >
            <span>
              Showing {customers.length} {customers.length === 1 ? 'customer' : 'customers'}
            </span>

            {totalReceivable > 0 && (
              <span style={{ fontSize: 13, color: '#475569' }}>
                Net Outstanding Receivable:{' '}
                <strong style={{ color: '#059669' }}>
                  AED {totalReceivable.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </span>
            )}
          </Box>
        </Box>
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, minWidth: 380, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#DC2626', pb: 1 }}>
          Confirm Delete
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.925rem', color: '#475569' }}>
            Are you sure you want to delete customer <strong>"{deleteTargetName}"</strong>? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
          <Button
            onClick={() => setDeleteConfirmOpen(false)}
            sx={{ textTransform: 'none', borderRadius: 2, color: '#64748B', px: 2 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleDeleteConfirm}
            autoFocus
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              bgcolor: '#DC2626',
              '&:hover': { bgcolor: '#B91C1C' },
              boxShadow: 'none',
              px: 2.5,
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Success Dialog */}
      <Dialog
        open={successDialogOpen}
        onClose={() => setSuccessDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, minWidth: 360, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#16A34A', pb: 1 }}>
          Success
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.925rem', color: '#475569' }}>
            {successDialogMessage}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
          <Button
            variant="contained"
            onClick={() => setSuccessDialogOpen(false)}
            autoFocus
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              bgcolor: '#16A34A',
              '&:hover': { bgcolor: '#15803D' },
              boxShadow: 'none',
              px: 3,
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>

      {/* Error Dialog */}
      <Dialog
        open={errorDialogOpen}
        onClose={() => setErrorDialogOpen(false)}
        PaperProps={{ sx: { borderRadius: 3, minWidth: 360, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#DC2626', pb: 1 }}>
          Error
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.925rem', color: '#475569' }}>
            {errorDialogMessage}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
          <Button
            variant="contained"
            onClick={() => setErrorDialogOpen(false)}
            autoFocus
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              bgcolor: '#DC2626',
              '&:hover': { bgcolor: '#B91C1C' },
              boxShadow: 'none',
              px: 3,
            }}
          >
            OK
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
