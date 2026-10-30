import { useState, useEffect, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  Tooltip,
  Chip,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Fab,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HubIcon from '@mui/icons-material/Hub';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import VerticalAlignTopIcon from '@mui/icons-material/VerticalAlignTop';
import { riayatiApi, Hl7ListenerStatusData, Hl7LogEntry } from '../../services/api';

export default function Hl7MockListener() {
  const [port, setPort] = useState<number>(2575);
  const [status, setStatus] = useState<Hl7ListenerStatusData | null>(null);
  const [logs, setLogs] = useState<Hl7LogEntry[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  // Raw message payload inspector dialog
  const [selectedLog, setSelectedLog] = useState<Hl7LogEntry | null>(null);

  const [alert, setAlert] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({
    open: false,
    message: '',
    severity: 'info',
  });

  const terminalBoxRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Fetch status and logs
  const fetchStatusAndLogs = async () => {
    try {
      const [statusRes, logsRes] = await Promise.all([
        riayatiApi.getStatus(),
        riayatiApi.getLogs(200),
      ]);
      if (statusRes.data?.data) {
        setStatus(statusRes.data.data);
        if (statusRes.data.data.port) {
          setPort(statusRes.data.data.port);
        }
      }
      if (logsRes.data?.data) {
        setLogs(logsRes.data.data);
      }
    } catch (err: any) {
      // Ignore polling errors quietly
    }
  };

  useEffect(() => {
    fetchStatusAndLogs();
  }, []);

  // Polling effect
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchStatusAndLogs();
    }, 2000);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && terminalBoxRef.current) {
      terminalBoxRef.current.scrollTo({
        top: terminalBoxRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [logs, autoScroll]);

  // Handle scroll detection in terminal box
  const handleTerminalScroll = () => {
    if (!terminalBoxRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalBoxRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setShowScrollBottomBtn(!isAtBottom);
  };

  const scrollToBottom = () => {
    if (terminalBoxRef.current) {
      terminalBoxRef.current.scrollTo({
        top: terminalBoxRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  };

  const scrollToTop = () => {
    if (terminalBoxRef.current) {
      terminalBoxRef.current.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    }
  };

  const handleStartListener = async () => {
    setActionLoading(true);
    try {
      const res = await riayatiApi.startListener(Number(port) || 2575);
      setAlert({
        open: true,
        message: res.data?.data?.message || `Listener started on port ${port}`,
        severity: 'success',
      });
      await fetchStatusAndLogs();
    } catch (err: any) {
      setAlert({ open: true, message: err?.response?.data?.message || err.message, severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopListener = async () => {
    setActionLoading(true);
    try {
      const res = await riayatiApi.stopListener();
      setAlert({ open: true, message: res.data?.data?.message || 'Listener stopped', severity: 'info' });
      await fetchStatusAndLogs();
    } catch (err: any) {
      setAlert({ open: true, message: err?.response?.data?.message || err.message, severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await riayatiApi.clearLogs();
      setLogs([]);
      setAlert({ open: true, message: 'Logs cleared', severity: 'info' });
    } catch (err: any) {
      setAlert({ open: true, message: 'Failed to clear logs', severity: 'error' });
    }
  };

  const formatHl7Highlighted = (raw: string) => {
    if (!raw) return null;
    const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
    return lines.map((line, idx) => {
      const segId = line.substring(0, 3);
      let color = '#38bdf8'; // cyan default
      if (segId === 'MSH') color = '#fbbf24'; // amber
      else if (segId === 'PID') color = '#4ade80'; // emerald
      else if (segId === 'PV1') color = '#a78bfa'; // purple
      else if (segId === 'ORC') color = '#f472b6'; // pink
      else if (segId === 'RXO' || segId === 'RXD') color = '#fb923c'; // orange
      else if (segId === 'MSA') color = '#34d399'; // green

      return (
        <div key={idx} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{ color, fontWeight: 'bold', display: 'inline-block', width: '45px' }}>{segId}</span>
          <span style={{ color: '#e2e8f0', wordBreak: 'break-all' }}>{line.substring(3)}</span>
        </div>
      );
    });
  };

  return (
    <Box
      sx={{
        p: { xs: 1, md: 1.5 },
        height: 'calc(100vh - 75px)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        maxWidth: 1440,
        margin: '0 auto',
      }}
    >
      {/* Reduced Header Banner (~70% smaller) */}
      <Paper
        elevation={0}
        sx={{
          py: 0.8,
          px: 1.5,
          mb: 1.2,
          borderRadius: 2,
          background: 'linear-gradient(135deg, #092e28 0%, #0d4a3e 50%, #135d50 100%)',
          color: '#ffffff',
          boxShadow: '0 4px 12px rgba(13, 74, 62, 0.25)',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            <Box
              sx={{
                width: 30,
                height: 30,
                borderRadius: 1.5,
                bgcolor: 'rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HubIcon sx={{ fontSize: 18, color: '#5eead4' }} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.92rem', letterSpacing: -0.2 }}>
                HL7 Mock Listener
              </Typography>
              {status?.isRunning ? (
                <Chip
                  icon={<CheckCircleOutlineIcon style={{ color: '#047857', fontSize: 14 }} />}
                  label={`PORT ${status.port} ACTIVE`}
                  size="small"
                  sx={{
                    bgcolor: '#d1fae5',
                    color: '#065f46',
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    height: 22,
                  }}
                />
              ) : (
                <Chip
                  icon={<ErrorOutlineIcon style={{ color: '#b91c1c', fontSize: 14 }} />}
                  label="STOPPED"
                  size="small"
                  sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: '0.68rem', height: 22 }}
                />
              )}
            </Box>
          </Box>

          {/* Quick Metrics Badges */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip
              size="small"
              label={`Received: ${status?.totalReceived ?? 0}`}
              sx={{ bgcolor: 'rgba(0,0,0,0.25)', color: '#5eead4', height: 22, fontSize: '0.72rem', fontWeight: 700 }}
            />
            <Chip
              size="small"
              label={`Active TCP: ${status?.activeConnections ?? 0}`}
              sx={{ bgcolor: 'rgba(0,0,0,0.25)', color: '#fef08a', height: 22, fontSize: '0.72rem', fontWeight: 700 }}
            />
          </Box>
        </Box>
      </Paper>

      {/* Alert Banner */}
      {alert.open && (
        <Alert
          severity={alert.severity}
          onClose={() => setAlert({ ...alert, open: false })}
          sx={{ mb: 1, py: 0, borderRadius: 1.5, flexShrink: 0 }}
        >
          {alert.message}
        </Alert>
      )}

      {/* Compact Control Panel Card */}
      <Paper
        elevation={1}
        sx={{
          px: 1.5,
          py: 0.8,
          mb: 1.2,
          borderRadius: 2,
          border: '1px solid #e2e8f0',
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Port"
              type="number"
              value={port}
              disabled={status?.isRunning || actionLoading}
              onChange={(e) => setPort(Number(e.target.value))}
              sx={{ width: 100 }}
              inputProps={{ style: { padding: '5px 8px', fontSize: '0.85rem' } }}
              InputLabelProps={{ style: { fontSize: '0.82rem' } }}
            />

            {!status?.isRunning ? (
              <Button
                variant="contained"
                size="small"
                startIcon={<PlayArrowIcon fontSize="small" />}
                disabled={actionLoading}
                onClick={handleStartListener}
                sx={{
                  bgcolor: '#0f766e',
                  '&:hover': { bgcolor: '#0d5d57' },
                  px: 1.8,
                  py: 0.6,
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  borderRadius: 1.5,
                  textTransform: 'none',
                }}
              >
                {actionLoading ? <CircularProgress size={16} color="inherit" /> : 'Start Listener'}
              </Button>
            ) : (
              <Button
                variant="contained"
                size="small"
                color="error"
                startIcon={<StopIcon fontSize="small" />}
                disabled={actionLoading}
                onClick={handleStopListener}
                sx={{
                  px: 1.8,
                  py: 0.6,
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  borderRadius: 1.5,
                  textTransform: 'none',
                }}
              >
                {actionLoading ? <CircularProgress size={16} color="inherit" /> : 'Stop Listener'}
              </Button>
            )}

            <Button
              variant="outlined"
              size="small"
              color="inherit"
              startIcon={<DeleteSweepIcon fontSize="small" />}
              onClick={handleClearLogs}
              sx={{ borderRadius: 1.5, py: 0.6, fontSize: '0.8rem', textTransform: 'none' }}
            >
              Clear Logs
            </Button>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  color="success"
                />
              }
              label={
                <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>
                  Polling (2s)
                </Typography>
              }
              sx={{ mr: 0 }}
            />

            <Tooltip title="Manual Refresh Now">
              <IconButton size="small" onClick={fetchStatusAndLogs} sx={{ border: '1px solid #cbd5e1' }}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Main Terminal View (Fits on Screen) */}
      <Paper
        elevation={1}
        sx={{
          flex: 1,
          minHeight: 0,
          borderRadius: 2,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Terminal Header & Scroll Buttons */}
        <Box
          sx={{
            py: 0.8,
            px: 2,
            bgcolor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ color: '#0f766e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Live HL7 MLLP Logs ({logs.length})
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
              · Protocol Framing: &lt;VT&gt;0x0B ... &lt;FS&gt;&lt;CR&gt;0x1C 0x0D
            </Typography>
          </Box>

          {/* Scroll Controls & Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Typography variant="caption" sx={{ color: '#475569', fontWeight: 600 }}>
                  Auto-Scroll
                </Typography>
              }
              sx={{ mr: 1 }}
            />

            <Tooltip title="Scroll to Top">
              <IconButton
                size="small"
                onClick={scrollToTop}
                sx={{
                  border: '1px solid #e2e8f0',
                  bgcolor: '#ffffff',
                  p: 0.5,
                  '&:hover': { bgcolor: '#f1f5f9' },
                }}
              >
                <VerticalAlignTopIcon sx={{ fontSize: 16, color: '#475569' }} />
              </IconButton>
            </Tooltip>

            <Tooltip title="Scroll to Bottom">
              <Button
                variant="outlined"
                size="small"
                startIcon={<VerticalAlignBottomIcon sx={{ fontSize: 16 }} />}
                onClick={scrollToBottom}
                sx={{
                  py: 0.3,
                  px: 1.2,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  textTransform: 'none',
                  borderRadius: 1.5,
                  borderColor: '#cbd5e1',
                  color: '#334155',
                  bgcolor: '#fff',
                  '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' },
                }}
              >
                Scroll to Bottom
              </Button>
            </Tooltip>
          </Box>
        </Box>

        {/* Scrollable Terminal Stream */}
        <Box
          ref={terminalBoxRef}
          onScroll={handleTerminalScroll}
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            bgcolor: '#0f172a',
            color: '#f8fafc',
            p: 1.5,
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            fontSize: '0.8rem',
            position: 'relative',
          }}
        >
          {logs.length === 0 ? (
            <Box sx={{ py: 8, textAlign: 'center', color: '#64748b' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                No HL7 messages received yet.
              </Typography>
              <Typography variant="caption">
                Start the listener on port {port} and save a POS sale with Riayati enabled, or click &quot;Resend&quot; from the Riayati Status report.
              </Typography>
            </Box>
          ) : (
            logs.map((log) => {
              let badgeBg = '#334155';
              let badgeText = '#94a3b8';

              if (log.type === 'INCOMING') {
                badgeBg = '#0369a1';
                badgeText = '#bae6fd';
              } else if (log.type === 'OUTGOING') {
                badgeBg = '#065f46';
                badgeText = '#a7f3d0';
              } else if (log.type === 'ERROR') {
                badgeBg = '#991b1b';
                badgeText = '#fecaca';
              } else if (log.type === 'INFO') {
                badgeBg = '#854d0e';
                badgeText = '#fef08a';
              }

              return (
                <Box
                  key={log.id}
                  sx={{
                    py: 0.6,
                    px: 0.8,
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.2,
                  }}
                >
                  <span style={{ color: '#64748b', userSelect: 'none', fontSize: '0.75rem', minWidth: '70px' }}>
                    [{log.timestamp}]
                  </span>
                  <span
                    style={{
                      backgroundColor: badgeBg,
                      color: badgeText,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      userSelect: 'none',
                    }}
                  >
                    {log.type}
                  </span>

                  {log.messageType && (
                    <span
                      style={{
                        backgroundColor: '#1e293b',
                        color: '#38bdf8',
                        border: '1px solid #334155',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                      }}
                    >
                      {log.messageType}
                    </span>
                  )}

                  <Box sx={{ flex: 1, color: '#cbd5e1', wordBreak: 'break-word', fontSize: '0.78rem' }}>
                    {log.summary}
                  </Box>

                  {(log.rawMessage || log.rawResponse) && (
                    <Button
                      size="small"
                      variant="text"
                      startIcon={<VisibilityIcon sx={{ fontSize: 13 }} />}
                      onClick={() => setSelectedLog(log)}
                      sx={{
                        color: '#38bdf8',
                        fontSize: '0.7rem',
                        py: 0,
                        px: 0.5,
                        minWidth: 0,
                        textTransform: 'none',
                        flexShrink: 0,
                      }}
                    >
                      Payload
                    </Button>
                  )}
                </Box>
              );
            })
          )}
          <div ref={terminalEndRef} />
        </Box>

        {/* Floating Scroll-to-Bottom Button */}
        {showScrollBottomBtn && (
          <Tooltip title="Jump to Bottom">
            <Fab
              size="small"
              onClick={scrollToBottom}
              sx={{
                position: 'absolute',
                bottom: 16,
                right: 20,
                bgcolor: '#0f766e',
                color: '#fff',
                '&:hover': { bgcolor: '#0d5d57' },
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                width: 36,
                height: 36,
              }}
            >
              <ArrowDownwardIcon fontSize="small" />
            </Fab>
          </Tooltip>
        )}
      </Paper>

      {/* Raw Payload Inspector Modal */}
      <Dialog
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid #e2e8f0', bgcolor: '#f8fafc', py: 1.5 }}>
          HL7 Message Payload Inspector
        </DialogTitle>
        <DialogContent sx={{ p: 2.5 }}>
          {selectedLog && (
            <Box>
              <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
                <Chip label={selectedLog.type} color={selectedLog.type === 'INCOMING' ? 'primary' : 'success'} size="small" />
                {selectedLog.messageType && <Chip label={selectedLog.messageType} variant="outlined" size="small" />}
                <Chip label={`Time: ${selectedLog.timestamp}`} size="small" variant="outlined" />
              </Box>

              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', mb: 1 }}>
                Raw HL7 Message Segments:
              </Typography>
              <Box
                sx={{
                  bgcolor: '#0f172a',
                  color: '#f8fafc',
                  p: 1.5,
                  borderRadius: 2,
                  fontFamily: 'Consolas, monospace',
                  fontSize: '0.8rem',
                  maxHeight: 220,
                  overflowY: 'auto',
                  mb: 2.5,
                }}
              >
                {formatHl7Highlighted(selectedLog.rawMessage || selectedLog.summary)}
              </Box>

              {selectedLog.rawResponse && (
                <>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155', mb: 1 }}>
                    Outgoing Response Payload:
                  </Typography>
                  <Box
                    sx={{
                      bgcolor: '#0f172a',
                      color: '#f8fafc',
                      p: 1.5,
                      borderRadius: 2,
                      fontFamily: 'Consolas, monospace',
                      fontSize: '0.8rem',
                      maxHeight: 180,
                      overflowY: 'auto',
                    }}
                  >
                    {formatHl7Highlighted(selectedLog.rawResponse)}
                  </Box>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 1.5, borderTop: '1px solid #e2e8f0' }}>
          <Button onClick={() => setSelectedLog(null)} variant="outlined" size="small" sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
