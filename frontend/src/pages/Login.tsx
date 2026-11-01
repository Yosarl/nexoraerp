import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { Box, Button, TextField, Typography, Alert, CircularProgress, InputAdornment } from '@mui/material';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { useAppDispatch } from '../store/hooks';
import { setCredentials } from '../store/slices/authSlice';
import { setCompany, setFinancialYear } from '../store/slices/appSlice';
import { authApi, financialYearApi } from '../services/api';
import { NexoraSymbol, NexoraWordmark } from '../components/NexoraLogo';
import {
  AMBER,
  BAR_GRAD,
  GRAD,
  GRAD_HOVER,
  INK,
  LEDGER_RULES,
  PAPER,
  PAPER_BG,
  ROSE,
  SUB,
  WHITE_CARD,
  tileLabel,
  tileValue,
} from '../theme/nexora';

interface LoginForm {
  username: string;
  password: string;
}

const MotionBox = motion.create(Box);
const MotionButton = motion.create(Button);

const ENTER = { type: 'spring', bounce: 0.12, visualDuration: 0.5 } as const;

const T = {
  card: 0.3,
  tiles: 1.2,
  print: 0.45,
  printDur: 1.7,
  stamp: 2.3,
  jolt: 2.58,
  jobOut: 3.2,
  logo: 3.45,
};

const fieldSx = {
  '& .MuiInputLabel-root': { color: SUB, fontWeight: 600, fontSize: 14 },
  '& .MuiInputLabel-root.Mui-focused': { color: ROSE, fontWeight: 700 },
  '& .MuiInputLabel-root.Mui-error': { color: '#DC2626' },
  '& .MuiOutlinedInput-root': {
    color: INK,
    bgcolor: '#FFFDF8',
    borderRadius: '14px',
    fontSize: 15,
    fontWeight: 600,
    transition: 'box-shadow .22s ease, background-color .22s ease',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(30,41,59,0.13)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(225,29,72,0.5)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: ROSE },
    '&.Mui-focused': { boxShadow: '0 0 0 4px rgba(225,29,72,0.12)' },
    '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: '#DC2626' },
    '& .MuiOutlinedInput-input': {
      paddingTop: '17px',
      paddingBottom: '17px',
      paddingLeft: '15px',
    },
    '& .MuiInputAdornment-root': { color: '#94A3B8', mr: '4px' },
  },
  '& .MuiFormHelperText-root': { color: '#DC2626', marginLeft: '15px', fontWeight: 600 },
};

const tileSx = {
  bgcolor: '#FFFFFF',
  border: '1px solid rgba(30,41,59,0.08)',
  borderRadius: 2.5,
  boxShadow: WHITE_CARD,
  px: 1.4,
  py: 1.15,
  color: INK,
};

const rowSx = { display: 'flex', justifyContent: 'space-between' } as const;

const BAR_HEIGHTS = [10, 18, 13, 24, 16, 28];

function Bars() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.75, height: 30, mt: 0.75 }}>
      {BAR_HEIGHTS.map((h, i) => (
        <motion.div
          key={i}
          initial={{ scaleY: 0.05, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={{ type: 'spring', bounce: 0.2, visualDuration: 0.45, delay: T.tiles + 0.6 + i * 0.07 }}
          style={{ width: 11, height: h, transformOrigin: 'bottom', borderRadius: 3, background: BAR_GRAD }}
        />
      ))}
    </Box>
  );
}

function Spark() {
  return (
    <svg width={112} height={28} viewBox="0 0 112 28" style={{ display: 'block', marginTop: 6 }}>
      <motion.polyline
        points="2,23 19,15 36,19 53,6 70,12 88,3 110,9"
        fill="none"
        stroke={ROSE}
        strokeWidth={2}
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: 'easeInOut', delay: T.tiles + 0.7 }}
      />
    </svg>
  );
}

function LedDot({ color }: { color: string }) {
  return (
    <Box
      component="span"
      sx={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        bgcolor: color,
        display: 'inline-block',
        mr: 0.75,
        animation: 'nxBreathe 2.4s ease-in-out infinite',
        '@keyframes nxBreathe': { '0%,100%': { opacity: 0.4 }, '50%': { opacity: 1 } },
      }}
    />
  );
}

function VatBody() {
  return (
    <>
      <Box sx={tileLabel}>VAT return · Q3</Box>
      <Box sx={tileValue}>AED 18,240</Box>
      <Box sx={{ fontSize: 10, color: SUB, mt: 0.5 }}>
        <LedDot color={AMBER} />
        Due 28 Oct
      </Box>
    </>
  );
}

function ReceivablesBody({ value }: { value: string }) {
  return (
    <>
      <Box sx={tileLabel}>Receivables</Box>
      <Box sx={tileValue}>{value}</Box>
      <Bars />
    </>
  );
}

function CashBookBody() {
  return (
    <>
      <Box sx={tileLabel}>Cash book</Box>
      <Box sx={tileValue}>+ AED 9,380</Box>
      <Spark />
    </>
  );
}

const RECEIPT_ROWS: Array<[string, string]> = [
  ['Basmati rice 5kg', '42.00'],
  ['Fresh milk 2L', '12.50'],
  ['Medjool dates 1kg', '28.00'],
  ['Olive oil 1L', '31.75'],
];

const receiptStyle = {
  position: 'relative',
  width: 188,
  height: 300,
  boxSizing: 'border-box',
  padding: '14px 15px',
  background: '#FFFFFF',
  boxShadow: '0 10px 24px rgba(120,53,15,0.12)',
  fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, monospace',
  fontSize: 10,
  lineHeight: 1.6,
  color: '#334155',
} as const;

function ReceiptJob() {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 0, y: 28, scale: 0.96 }}
      transition={{ delay: T.jobOut, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }}
    >
      <Box
        sx={{
          position: 'absolute',
          left: -128,
          top: -214,
          width: 256,
          height: 36,
          borderRadius: '12px',
          background: 'linear-gradient(#334155,#1E293B)',
          boxShadow: '0 14px 26px rgba(30,41,59,0.25)',
          zIndex: 3,
        }}
      >
        <Box sx={{ position: 'absolute', left: 28, right: 28, bottom: 7, height: 4, borderRadius: '2px', bgcolor: '#0B1220' }} />
        <Box
          sx={{
            position: 'absolute',
            right: 14,
            top: 9,
            width: 7,
            height: 7,
            borderRadius: '50%',
            bgcolor: '#4ADE80',
            boxShadow: '0 0 8px #4ADE80',
            animation: `nxLed 0.24s linear ${T.print}s 7`,
            '@keyframes nxLed': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.25 } },
          }}
        />
      </Box>

      <motion.div
        initial={{ y: 0 }}
        animate={{ y: [0, 4, 0] }}
        transition={{ delay: T.jolt, duration: 0.28, ease: 'easeInOut' }}
        style={{ position: 'absolute', left: -94, top: -182, width: 188, zIndex: 2 }}
      >
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 312 }}
          transition={{ delay: T.print, duration: T.printDur, ease: (p: number) => Math.floor(p * 18) / 18 }}
          style={{ width: 188, height: 0, overflow: 'hidden' }}
        >
          <div style={receiptStyle}>
            <Box
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: -8,
                height: 8,
                background: 'radial-gradient(circle at 6px 0, #fff 6px, transparent 6.5px) 0 0 / 12px 8px repeat-x',
              }}
            />
            <Box sx={{ textAlign: 'center', fontWeight: 800, fontSize: 12.5, letterSpacing: '0.18em', color: INK }}>NEXORA POS</Box>
            <Box sx={{ textAlign: 'center', fontSize: 9, color: SUB }}>Tax Invoice · INV-24817</Box>
            <Box sx={{ textAlign: 'center', fontSize: 9, color: SUB }}>21 Oct 2026 · 14:32 · Till 02</Box>
            <Box sx={{ border: '1.5px dashed #CBD5E1', my: 0.875 }} />
            {RECEIPT_ROWS.map(([label, amount]) => (
              <Box key={label} sx={rowSx}>
                <span>{label}</span>
                <span>{amount}</span>
              </Box>
            ))}
            <Box sx={{ border: '1.5px dashed #CBD5E1', my: 0.875 }} />
            <Box sx={rowSx}>
              <span>Subtotal</span>
              <span>114.25</span>
            </Box>
            <Box sx={rowSx}>
              <span>VAT 5%</span>
              <span>5.71</span>
            </Box>
            <Box sx={{ ...rowSx, fontWeight: 800, fontSize: 12, color: INK, mt: 0.25 }}>
              <span>TOTAL AED</span>
              <span>119.96</span>
            </Box>
            <Box sx={{ border: '1.5px dashed #CBD5E1', my: 0.875 }} />
            <Box
              sx={{
                height: 22,
                mx: 1.25,
                mt: 0.75,
                background:
                  'repeating-linear-gradient(90deg,#1E293B 0 2px,transparent 2px 4px,#1E293B 4px 5px,transparent 5px 8px,#1E293B 8px 11px,transparent 11px 13px)',
              }}
            />
            <Box sx={{ textAlign: 'center', fontSize: 9, color: SUB, mt: 0.5 }}>Thank you for shopping</Box>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 2.3, rotate: -26 }}
        animate={{ opacity: [0, 1, 1], scale: [2.3, 0.93, 1], rotate: [-26, -11, -12] }}
        transition={{ delay: T.stamp, duration: 0.5, times: [0, 0.65, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: -22, top: -66, width: 112, height: 112, zIndex: 4 }}
      >
        <Box
          sx={{
            width: 112,
            height: 112,
            borderRadius: '50%',
            boxSizing: 'border-box',
            border: `3px solid ${ROSE}`,
            boxShadow: 'inset 0 0 0 4px rgba(255,255,255,0.9), inset 0 0 0 6px #E11D48',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.25,
            color: ROSE,
            bgcolor: 'rgba(255,241,242,0.55)',
            mixBlendMode: 'multiply',
          }}
        >
          <NexoraSymbol size={50} animated={false} colors={[ROSE, '#F43F5E', '#FB7185']} />
          <Box component="b" sx={{ fontSize: 11, letterSpacing: '0.32em', ml: '0.32em' }}>
            PAID
          </Box>
        </Box>
      </motion.div>
    </motion.div>
  );
}

function BrandHero() {
  const [receivables, setReceivables] = useState(64910);

  useEffect(() => {
    const id = window.setInterval(() => {
      setReceivables((v) => v + 40 + Math.floor(Math.random() * 180));
    }, 2600);
    return () => window.clearInterval(id);
  }, []);

  const receivablesText = `AED ${receivables.toLocaleString('en-US')}`;

  return (
    <Box
      sx={{
        position: 'relative',
        flex: { md: '0 0 55%' },
        width: '100%',
        minHeight: { xs: 520, md: '100vh' },
        overflow: 'hidden',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: LEDGER_RULES,
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 58,
            width: 1.5,
            background: 'rgba(225,29,72,0.22)',
          },
        }}
      />

      <MotionBox
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: T.tiles, duration: 0.5 }}
        sx={{ ...tileSx, position: 'absolute', left: '5%', top: '9%', width: 172, display: { xs: 'none', md: 'block' }, zIndex: 0 }}
      >
        <VatBody />
      </MotionBox>
      <MotionBox
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: T.tiles + 0.25, duration: 0.5 }}
        sx={{ ...tileSx, position: 'absolute', right: '4%', top: '16%', width: 156, display: { xs: 'none', md: 'block' }, zIndex: 0 }}
      >
        <ReceivablesBody value={receivablesText} />
      </MotionBox>
      <MotionBox
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: T.tiles + 0.5, duration: 0.5 }}
        sx={{ ...tileSx, position: 'absolute', left: '7%', bottom: '12%', width: 156, display: { xs: 'none', md: 'block' }, zIndex: 0 }}
      >
        <CashBookBody />
      </MotionBox>

      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 0,
          height: 0,
          pointerEvents: 'none',
          transform: { xs: 'scale(0.84)', md: 'scale(1)' },
        }}
      >
        <ReceiptJob />

        <Box sx={{ position: 'absolute', left: -180, top: -152, width: 360, textAlign: 'center' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', bounce: 0.42, visualDuration: 0.55, delay: T.logo }}
            style={{ display: 'inline-block', background: '#FFFFFF', borderRadius: 24, padding: 16, boxShadow: '0 22px 50px rgba(120,53,15,0.16)' }}
          >
            <NexoraSymbol size={84} animated={false} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: T.logo + 0.3, duration: 0.5 }}
            style={{ marginTop: 16, color: INK, display: 'flex', justifyContent: 'center' }}
          >
            <NexoraWordmark width={212} delay={T.logo + 0.35} />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: T.logo + 0.5, duration: 0.5 }}
            style={{ marginTop: 9, fontSize: 11, letterSpacing: '0.34em', fontWeight: 700, color: ROSE }}
          >
            ENTERPRISE SYSTEM
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: T.logo + 0.7, duration: 0.55 }}
            style={{ marginTop: 13, fontSize: 12.5, lineHeight: 1.7, color: SUB, maxWidth: 320, marginInline: 'auto' }}
          >
            Every sale prints a clean ledger — invoices, VAT and cash book balanced the moment you close the till.
          </motion.div>
        </Box>
      </Box>

      <Box
        sx={{
          display: { xs: 'flex', md: 'none' },
          gap: 1.25,
          position: 'absolute',
          left: 2,
          right: 2,
          bottom: 18,
          px: 2,
          boxSizing: 'border-box',
          zIndex: 1,
        }}
      >
        {[
          { delay: T.tiles, body: <VatBody /> },
          { delay: T.tiles + 0.25, body: <CashBookBody /> },
        ].map((tile, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: tile.delay, duration: 0.5 }}
            style={{ flex: '1 1 0', minWidth: 0 }}
          >
            <Box sx={tileSx}>{tile.body}</Box>
          </motion.div>
        ))}
      </Box>
    </Box>
  );
}

function LoginCard({ form, error, loading, onSubmit }: {
  form: UseFormReturn<LoginForm>;
  error: string;
  loading: boolean;
  onSubmit: (data: LoginForm) => Promise<void>;
}) {
  const { register, handleSubmit, formState: { errors } } = form;

  return (
    <Box sx={{ flex: { md: '0 0 45%' }, width: '100%', display: 'flex', justifyContent: 'center' }}>
      <MotionBox
        initial={{ opacity: 0, x: 44, y: 8 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ ...ENTER, delay: T.card }}
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 430,
          overflow: 'hidden',
          bgcolor: '#FFFFFF',
          border: '1px solid rgba(30,41,59,0.10)',
          borderRadius: 5,
          p: { xs: 3, sm: 4 },
          pt: { xs: 3.5, sm: 4.5 },
          boxShadow: '0 34px 70px -24px rgba(120,53,15,0.30), 0 2px 8px rgba(30,41,59,0.05)',
        }}
      >
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: GRAD }} />
        <Box component="form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <MotionBox initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: T.card + 0.15, duration: 0.4 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                bgcolor: '#FFF1F2',
                color: '#BE123C',
                borderRadius: '999px',
                px: 1.25,
                py: 0.5,
                mb: 2,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              <VerifiedUserOutlinedIcon sx={{ fontSize: 15 }} />
              Secure workspace
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: INK, letterSpacing: -0.8, fontSize: 30 }}>
              Welcome back
            </Typography>
            <Typography variant="body2" sx={{ color: SUB, mt: 0.75, mb: 3.25 }}>
              Use your company credentials to open the workspace.
            </Typography>
          </MotionBox>

          <AnimatePresence>
            {error && (
              <MotionBox
                key="error"
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto', x: [0, -6, 6, -4, 4, 0] }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                transition={{ duration: 0.35 }}
                sx={{ overflow: 'hidden', mb: 2 }}
              >
                <Alert severity="error" sx={{ borderRadius: 3, bgcolor: '#FEF2F2', color: '#B91C1C' }}>
                  {error}
                </Alert>
              </MotionBox>
            )}
          </AnimatePresence>

          <MotionBox initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: T.card + 0.25, duration: 0.4 }} sx={{ mb: 2 }}>
            <TextField
              fullWidth
              variant="outlined"
              label="Username"
              autoFocus
              {...register('username', { required: 'Username is required' })}
              error={!!errors.username}
              helperText={errors.username?.message}
              autoComplete="username"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <PersonOutlineRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={fieldSx}
            />
          </MotionBox>
          <MotionBox initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: T.card + 0.33, duration: 0.4 }} sx={{ mb: 3 }}>
            <TextField
              fullWidth
              variant="outlined"
              type="password"
              label="Password"
              {...register('password', { required: 'Password is required' })}
              error={!!errors.password}
              helperText={errors.password?.message}
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <LockRoundedIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
              sx={fieldSx}
            />
          </MotionBox>

          <MotionButton
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={loading}
            whileHover={{ scale: loading ? 1 : 1.012 }}
            whileTap={{ scale: 0.985 }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: T.card + 0.41, duration: 0.4 }}
            sx={{
              borderRadius: '14px',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: 0.2,
              py: 1.5,
              color: '#FFFFFF',
              background: GRAD,
              boxShadow: '0 14px 30px -10px rgba(225,29,72,0.55)',
              transition: 'box-shadow .22s ease, filter .22s ease',
              '&:hover': {
                background: GRAD_HOVER,
                boxShadow: '0 18px 34px -10px rgba(225,29,72,0.65)',
              },
              '& .nx-arrow': { transition: 'transform .22s ease' },
              '&:hover .nx-arrow': { transform: 'translateX(4px)' },
            }}
          >
            {loading ? (
              <CircularProgress size={24} sx={{ color: '#fff' }} />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                Sign In
                <ArrowForwardRoundedIcon className="nx-arrow" fontSize="small" />
              </Box>
            )}
          </MotionButton>

          <MotionBox initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: T.card + 0.55, duration: 0.4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 3 }}>
              <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(30,41,59,0.08)' }} />
              <Typography variant="caption" sx={{ color: '#94A3B8', whiteSpace: 'nowrap' }}>
                admin / Admin@123 after seed
              </Typography>
              <Box sx={{ flex: 1, height: '1px', bgcolor: 'rgba(30,41,59,0.08)' }} />
            </Box>
          </MotionBox>
        </Box>
      </MotionBox>
    </Box>
  );
}

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const form = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    setError('');
    setLoading(true);
    try {
      const res = await authApi.login(data.username, data.password);
      const { token, user } = res.data.data as { token: string; user: { companyAccess?: string[] } };
      const userPayload = user as {
        _id: string;
        username: string;
        fullName: string;
        roles: string[];
        permissions: string[];
        companyAccess: string[];
      };
      dispatch(setCredentials({ token, user: userPayload }));

      const hasCompany = userPayload.companyAccess?.length && userPayload.companyAccess.length > 0;
      if (!hasCompany) {
        navigate('/file/companies/create');
        return;
      }
      if (hasCompany) {
        const savedCompany = localStorage.getItem('selectedCompanyId');
        const companyId = (savedCompany && userPayload.companyAccess.includes(savedCompany))
          ? savedCompany
          : userPayload.companyAccess[0];
        dispatch(setCompany(companyId));
        try {
          const fyRes = await financialYearApi.getCurrent(companyId);
          const fy = fyRes.data.data as { _id: string };
          if (fy?._id) dispatch(setFinancialYear(fy._id));
        } catch {
          // ignore if no current FY
        }
      }
      navigate('/');
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string; errors?: Array<{ msg?: string }> }; status?: number };
        message?: string;
        code?: string;
      };
      const data = ax?.response?.data;
      let msg = data?.message;
      if (!msg && data?.errors?.length) {
        msg = data.errors.map((e) => e.msg).filter(Boolean).join('. ') || 'Validation failed';
      }
      if (!msg) {
        msg =
          ax?.code === 'ECONNABORTED' || ax?.message === 'Network Error'
            ? 'Request timed out or server unreachable. If the backend was idle, wait ~1 minute and try again.'
            : 'Login failed';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <Box
        sx={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          bgcolor: PAPER,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            backgroundImage: PAPER_BG,
          }}
        >
          <MotionBox
            sx={{
              position: 'absolute',
              top: -140,
              right: -60,
              width: 460,
              height: 460,
              borderRadius: '50%',
              filter: 'blur(110px)',
              background: 'radial-gradient(circle, rgba(245,158,11,0.20), transparent 70%)',
            }}
            animate={{ x: [0, -36, 0], y: [0, 26, 0] }}
            transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
          />
          <MotionBox
            sx={{
              position: 'absolute',
              bottom: -120,
              left: -80,
              width: 420,
              height: 420,
              borderRadius: '50%',
              filter: 'blur(110px)',
              background: 'radial-gradient(circle, rgba(225,29,72,0.14), transparent 70%)',
            }}
            animate={{ x: [0, 32, 0], y: [0, -24, 0] }}
            transition={{ duration: 21, repeat: Infinity, ease: 'easeInOut' }}
          />
        </Box>

        <Box
          sx={{
            position: 'relative',
            width: '100%',
            maxWidth: 1180,
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BrandHero />
          <LoginCard form={form} error={error} loading={loading} onSubmit={onSubmit} />
        </Box>
      </Box>
    </MotionConfig>
  );
}
