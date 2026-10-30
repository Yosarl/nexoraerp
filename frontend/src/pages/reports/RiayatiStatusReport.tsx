import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Pagination,
  Stack,
  Divider,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import HubIcon from '@mui/icons-material/Hub';
import SearchIcon from '@mui/icons-material/Search';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import { riayatiApi, RiayatiInvoiceItem, RiayatiStatusKpis } from '../../services/api';
import DateInput, { getCurrentDate, formatDateDisplay } from '../../components/DateInput';

export default function RiayatiStatusReport() {
  const [invoices, setInvoices] = useState<RiayatiInvoiceItem[]>([]);
  const [kpis, setKpis] = useState<RiayatiStatusKpis>({
    total: 0,
    success: 0,
    failed: 0,
    pending: 0,
    offline: 0,
  });
  const [loading, setLoading] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [resendingAll, setResendingAll] = useState(false);
  const [alert, setAlert] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'info',
  });

  // Filter States
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState<string>(getCurrentDate);
  const [toDate, setToDate] = useState<string>(getCurrentDate);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Inspector Dialog State
  const [selectedInvoice, setSelectedInvoice] = useState<RiayatiInvoiceItem | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await riayatiApi.getInvoices({
        status: statusFilter !== 'All' ? statusFilter : undefined,
        search: search.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        page,
        limit: 25,
      });

      if (res.data?.success && res.data.data) {
        setInvoices(res.data.data.invoices || []);
        setKpis(
          res.data.data.kpis || {
            total: 0,
            success: 0,
            failed: 0,
            pending: 0,
            offline: 0,
          }
        );
        setTotalPages(res.data.data.pagination?.pages || 1);
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message: err.response?.data?.message || err.message || 'Failed to load Riayati submissions',
        severity: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, fromDate, toDate, page]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleResetFilters = () => {
    setStatusFilter('All');
    setSearch('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  const handleResendSingle = async (inv: RiayatiInvoiceItem) => {
    setResendingId(inv._id);
    try {
      const res = await riayatiApi.resendSubmission(inv._id);
      if (res.data?.success) {
        setAlert({
          open: true,
          message: `Invoice ${inv.invoiceNo} re-transmitted to Riayati (${res.data.data?.submissionResult?.status || 'Completed'})`,
          severity: res.data.data?.submissionResult?.status === 'Success' ? 'success' : 'info',
        });
        fetchInvoices();
        if (selectedInvoice?._id === inv._id && res.data.data?.invoice) {
          setSelectedInvoice(res.data.data.invoice);
        }
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message: err.response?.data?.message || err.message || 'Re-transmission failed',
        severity: 'error',
      });
    } finally {
      setResendingId(null);
    }
  };

  const handleResendAllFailed = async () => {
    if (!window.confirm('Are you sure you want to resend all failed Riayati submissions?')) return;
    setResendingAll(true);
    try {
      const res = await riayatiApi.resendAllFailed();
      if (res.data?.success) {
        setAlert({
          open: true,
          message: res.data.message || 'Batch re-transmission completed.',
          severity: 'success',
        });
        fetchInvoices();
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message: err.response?.data?.message || err.message || 'Batch re-transmission error',
        severity: 'error',
      });
    } finally {
      setResendingAll(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Success':
        return (
          <Chip
            size="small"
            icon={<CheckCircleOutlineIcon style={{ color: '#047857' }} />}
            label="Success"
            sx={{ bgcolor: '#d1fae5', color: '#065f46', fontWeight: 700 }}
          />
        );
      case 'Failed':
        return (
          <Chip
            size="small"
            icon={<ErrorOutlineIcon style={{ color: '#b91c1c' }} />}
            label="Failed"
            sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 700 }}
          />
        );
      case 'Offline':
        return (
          <Chip
            size="small"
            icon={<WifiOffIcon style={{ color: '#64748b' }} />}
            label="Offline"
            sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 700 }}
          />
        );
      case 'Pending':
        return (
          <Chip
            size="small"
            icon={<HourglassEmptyIcon style={{ color: '#b45309' }} />}
            label="Pending"
            sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700 }}
          />
        );
      default:
        return (
          <Chip
            size="small"
            label={status || 'Not Applicable'}
            sx={{ bgcolor: '#e2e8f0', color: '#475569', fontWeight: 600 }}
          />
        );
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1440, margin: '0 auto' }}>
      {/* Header Bar */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 2.5,
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #0f766e 100%)',
          color: '#ffffff',
          boxShadow: '0 8px 20px -4px rgba(6, 78, 59, 0.35)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MedicalServicesIcon sx={{ fontSize: 26, color: '#6ee7b7' }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: -0.3 }}>
                Riayati HL7 Dispense Status Report
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                Track and manage UAE MOHAP Riayati outpatient dispense submissions, verify acknowledgments, and re-transmit failed logs.
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<HubIcon />}
              endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
              onClick={() => window.open('/utilities/hl7-mock-listener', '_blank')}
              sx={{
                color: '#fff',
                borderColor: 'rgba(255,255,255,0.4)',
                '&:hover': { borderColor: '#fff', bgcolor: 'rgba(255,255,255,0.1)' },
                borderRadius: 1.5,
                fontWeight: 600,
                textTransform: 'none',
              }}
            >
              HL7 Mock Listener
            </Button>

            <Button
              variant="contained"
              size="small"
              color="warning"
              disabled={resendingAll || kpis.failed === 0}
              startIcon={resendingAll ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              onClick={handleResendAllFailed}
              sx={{
                bgcolor: '#f59e0b',
                '&:hover': { bgcolor: '#d97706' },
                fontWeight: 700,
                borderRadius: 1.5,
                textTransform: 'none',
              }}
            >
              Resend All Failed ({kpis.failed})
            </Button>

            <Tooltip title="Refresh Status List">
              <IconButton
                size="small"
                onClick={fetchInvoices}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.15)',
                  color: '#fff',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' },
                }}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Alert banner */}
      {alert.open && (
        <Alert
          severity={alert.severity}
          onClose={() => setAlert({ ...alert, open: false })}
          sx={{ mb: 3, borderRadius: 2 }}
        >
          {alert.message}
        </Alert>
      )}

      {/* KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={1} sx={{ borderRadius: 2, border: '1px solid #e2e8f0' }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Total Invoices
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
                    {kpis.total}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#f1f5f9', color: '#475569' }}>
                  <MedicalServicesIcon />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={1} sx={{ borderRadius: 2, border: '1px solid #bbf7d0', bgcolor: '#f0fdf4' }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                    Successful Submissions
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: '#15803d', mt: 0.5 }}>
                    {kpis.success}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#dcfce7', color: '#16a34a' }}>
                  <CheckCircleOutlineIcon />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={1} sx={{ borderRadius: 2, border: '1px solid #fecaca', bgcolor: '#fef2f2' }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#991b1b', fontWeight: 700, textTransform: 'uppercase' }}>
                    Failed / Rejected
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: '#dc2626', mt: 0.5 }}>
                    {kpis.failed}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#fee2e2', color: '#dc2626' }}>
                  <ErrorOutlineIcon />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card elevation={1} sx={{ borderRadius: 2, border: '1px solid #fde68a', bgcolor: '#fffbeb' }}>
            <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="caption" sx={{ color: '#92400e', fontWeight: 700, textTransform: 'uppercase' }}>
                    Pending / Offline
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 800, color: '#b45309', mt: 0.5 }}>
                    {kpis.pending + kpis.offline}
                  </Typography>
                </Box>
                <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: '#fef3c7', color: '#d97706' }}>
                  <HourglassEmptyIcon />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filter Toolbar */}
      <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid #e2e8f0' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <TextField
              size="small"
              fullWidth
              label="Search Invoices"
              placeholder="Invoice #, Emirates ID, Patient, Doctor"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: '#94a3b8', mr: 1, fontSize: 20 }} />,
              }}
            />
          </Grid>

          <Grid item xs={12} sm={6} md={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="All">All Statuses</MenuItem>
                <MenuItem value="Success">Success</MenuItem>
                <MenuItem value="Failed">Failed</MenuItem>
                <MenuItem value="Pending">Pending</MenuItem>
                <MenuItem value="Offline">Offline</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={6} sm={4} md={2}>
            <DateInput
              size="small"
              fullWidth
              label="From Date"
              value={fromDate}
              onChange={(val) => {
                setFromDate(val);
                setPage(1);
              }}
            />
          </Grid>

          <Grid item xs={6} sm={4} md={2}>
            <DateInput
              size="small"
              fullWidth
              label="To Date"
              value={toDate}
              onChange={(val) => {
                setToDate(val);
                setPage(1);
              }}
            />
          </Grid>

          <Grid item xs={12} sm={4} md={3}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                onClick={() => {
                  setPage(1);
                  fetchInvoices();
                }}
                sx={{
                  bgcolor: '#0f766e',
                  '&:hover': { bgcolor: '#0d5d57' },
                  fontWeight: 600,
                  textTransform: 'none',
                  flex: 1,
                }}
              >
                Filter
              </Button>
              <Button
                variant="outlined"
                size="small"
                color="inherit"
                startIcon={<FilterAltOffIcon />}
                onClick={handleResetFilters}
                sx={{ textTransform: 'none' }}
              >
                Reset
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Main Table */}
      <Paper elevation={1} sx={{ borderRadius: 2.5, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <TableContainer sx={{ minHeight: 380 }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Invoice #</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Date & Time</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Patient / Emirates ID</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Doctor</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }} align="center">
                  Items
                </TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }} align="right">
                  Total
                </TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Riayati Status</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Response / Message</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }} align="center">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={32} sx={{ color: '#0f766e', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Loading Riayati submissions...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6, color: '#64748b' }}>
                    <MedicalServicesIcon sx={{ fontSize: 40, color: '#cbd5e1', mb: 1 }} />
                    <Typography variant="subtitle1" fontWeight={600}>
                      No Riayati submissions found
                    </Typography>
                    <Typography variant="body2">
                      Try adjusting the filter criteria or create a new POS invoice with Riayati enabled.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                invoices.map((inv) => (
                  <TableRow
                    key={inv._id}
                    hover
                    sx={{
                      '&:last-child td, &:last-child th': { border: 0 },
                      bgcolor:
                        inv.riayatiStatus === 'Failed'
                          ? '#fef2f2'
                          : inv.riayatiStatus === 'Success'
                          ? '#f0fdf4'
                          : 'inherit',
                    }}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                        {inv.invoiceNo}
                      </Typography>
                      {inv.type && (
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          {inv.type}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', color: '#334155' }}>
                        {inv.invoiceDate ? formatDateDisplay(inv.invoiceDate) : '-'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                        {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f172a' }}>
                        {inv.patientName || inv.customerName || 'Walk-in'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#0284c7', fontFamily: 'monospace' }}>
                        {inv.emiratesId ? `EID: ${inv.emiratesId}` : 'No Emirates ID'}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography variant="body2" sx={{ color: '#334155' }}>
                        {inv.doctorName || 'Dr. On Duty'}
                      </Typography>
                      {inv.doctorLicenseNo && (
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          Lic: {inv.doctorLicenseNo}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell align="center">
                      <Chip
                        size="small"
                        label={inv.itemCount ?? 1}
                        sx={{ height: 20, fontSize: '0.72rem', fontWeight: 600 }}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                        AED {(inv.totalAmount || 0).toFixed(2)}
                      </Typography>
                    </TableCell>

                    <TableCell>{getStatusBadge(inv.riayatiStatus)}</TableCell>

                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          color: inv.riayatiError ? '#dc2626' : '#475569',
                        }}
                        title={inv.riayatiError || (inv.riayatiAckCode ? `ACK Code: ${inv.riayatiAckCode}` : 'Ready')}
                      >
                        {inv.riayatiError || (inv.riayatiAckCode ? `ACK Code: ${inv.riayatiAckCode}` : '—')}
                      </Typography>
                    </TableCell>

                    <TableCell align="center">
                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Tooltip title="View Submission Payload & Details">
                          <IconButton
                            size="small"
                            onClick={() => setSelectedInvoice(inv)}
                            sx={{ color: '#0284c7' }}
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                        <Tooltip title="Resend Submission to Riayati HL7 Receiver">
                          <span>
                            <Button
                              size="small"
                              variant="outlined"
                              color={inv.riayatiStatus === 'Failed' ? 'error' : 'primary'}
                              disabled={resendingId === inv._id}
                              onClick={() => handleResendSingle(inv)}
                              sx={{
                                py: 0.2,
                                px: 1,
                                minWidth: 60,
                                fontSize: '0.72rem',
                                textTransform: 'none',
                                fontWeight: 600,
                              }}
                            >
                              {resendingId === inv._id ? (
                                <CircularProgress size={12} color="inherit" />
                              ) : (
                                'Resend'
                              )}
                            </Button>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0' }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, val) => setPage(val)}
            color="primary"
            size="small"
          />
        </Box>
      </Paper>

      {/* Detail / Payload Inspector Dialog */}
      <Dialog
        open={Boolean(selectedInvoice)}
        onClose={() => setSelectedInvoice(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <MedicalServicesIcon sx={{ color: '#0f766e' }} />
              <Typography variant="h6" fontWeight={700}>
                Riayati Submission Details — {selectedInvoice?.invoiceNo}
              </Typography>
            </Box>
            {selectedInvoice && getStatusBadge(selectedInvoice.riayatiStatus)}
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          {selectedInvoice && (
            <Stack spacing={2.5}>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                    PATIENT NAME
                  </Typography>
                  <Typography variant="body1" fontWeight={700}>
                    {selectedInvoice.patientName || selectedInvoice.customerName || 'Walk-in Patient'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                    EMIRATES ID (PID-3)
                  </Typography>
                  <Typography variant="body1" fontWeight={700} sx={{ color: '#0284c7', fontFamily: 'monospace' }}>
                    {selectedInvoice.emiratesId || 'Not Specified'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                    DOCTOR / PRESCRIBER
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {selectedInvoice.doctorName || 'Dr. On Duty'} ({selectedInvoice.doctorLicenseNo || 'MOH-1234'})
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                    RIAYATI VISIT NUMBER (PV1-19)
                  </Typography>
                  <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
                    {selectedInvoice.riayatiVisitNumber || `VN-${selectedInvoice.invoiceNo}`}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                    LAST TRANSMISSION TIMESTAMP
                  </Typography>
                  <Typography variant="body2">
                    {selectedInvoice.riayatiSubmittedAt
                      ? new Date(selectedInvoice.riayatiSubmittedAt).toLocaleString()
                      : selectedInvoice.invoiceDate
                      ? new Date(selectedInvoice.invoiceDate).toLocaleString()
                      : 'Not submitted yet'}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>
                    ACKNOWLEDGMENT / ACK CODE (MSA-1)
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {selectedInvoice.riayatiAckCode || (selectedInvoice.riayatiStatus === 'Success' ? 'AA (Accepted)' : '—')}
                  </Typography>
                </Grid>
              </Grid>

              <Divider />

              {selectedInvoice.riayatiError && (
                <Box sx={{ p: 2, bgcolor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 2 }}>
                  <Typography variant="subtitle2" sx={{ color: '#b91c1c', fontWeight: 700, mb: 0.5 }}>
                    Submission Error Diagnostics:
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#991b1b', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                    {selectedInvoice.riayatiError}
                  </Typography>
                </Box>
              )}

              <Box sx={{ p: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', mb: 1 }}>
                  HL7 v2.5.1 MLLP Outpatient Protocol Flow:
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', lineHeight: 1.6, display: 'block' }}>
                  1. <strong>ADT^A04</strong> (Register Patient Visit) - Assigns Visit No: {selectedInvoice.riayatiVisitNumber || `VN-${selectedInvoice.invoiceNo}`}
                  <br />
                  2. <strong>RDS^O13</strong> (Dispense Medication) - Reports dispensed drugs, batch numbers, dosage & packaging
                  <br />
                  3. <strong>ADT^A03</strong> (Discharge / End Visit) - Completes the outpatient encounter
                </Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button
            startIcon={<HubIcon />}
            onClick={() => window.open('/utilities/hl7-mock-listener', '_blank')}
            sx={{ textTransform: 'none', color: '#0f766e' }}
          >
            Open Live HL7 Listener
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setSelectedInvoice(null)} color="inherit" sx={{ textTransform: 'none' }}>
            Close
          </Button>
          {selectedInvoice && (
            <Button
              variant="contained"
              color="primary"
              disabled={resendingId === selectedInvoice._id}
              startIcon={resendingId === selectedInvoice._id ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              onClick={() => handleResendSingle(selectedInvoice)}
              sx={{ bgcolor: '#0f766e', '&:hover': { bgcolor: '#0d5d57' }, textTransform: 'none', fontWeight: 600 }}
            >
              Re-transmit Now
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
