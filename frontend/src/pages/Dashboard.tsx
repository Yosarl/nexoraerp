import { Box, Typography, Button, Grid } from '@mui/material';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, MotionConfig } from 'motion/react';
import { useAppSelector } from '../store/hooks';
import BusinessIcon from '@mui/icons-material/Business';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import InventoryIcon from '@mui/icons-material/Inventory';
import AddBoxIcon from '@mui/icons-material/AddBox';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { NexoraSymbol } from '../components/NexoraLogo';
import { GRAD, INK, LINE, PAPER_WARM, ROSE, ROSE_DEEP, ROSE_SOFT, SUB, WHITE_CARD, tileLabel } from '../theme/nexora';

const MotionBox = motion.create(Box);

const ENTER = { type: 'spring', bounce: 0.1, visualDuration: 0.45 } as const;

const panel = {
  position: 'relative',
  height: '100%',
  overflow: 'hidden',
  bgcolor: '#FFFFFF',
  border: `1px solid ${LINE}`,
  borderRadius: 4,
  p: 2.4,
  boxShadow: WHITE_CARD,
};

const accentBar = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  background: GRAD,
  transform: 'scaleX(0.18)',
  transformOrigin: 'left',
  transition: 'transform .35s cubic-bezier(0.4,0,0.2,1)',
};

const iconTile = {
  width: 40,
  height: 40,
  borderRadius: 2.25,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  bgcolor: ROSE_SOFT,
  color: ROSE,
  flexShrink: 0,
};

const statusChip = (ok: boolean) => ({
  display: 'inline-block',
  px: 1,
  py: 0.35,
  borderRadius: '999px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  bgcolor: ok ? ROSE_SOFT : PAPER_WARM,
  color: ok ? ROSE_DEEP : SUB,
});

const linkBtn = {
  mt: 1.75,
  textTransform: 'none',
  fontWeight: 700,
  fontSize: 13,
  color: ROSE_DEEP,
  bgcolor: ROSE_SOFT,
  borderRadius: '11px',
  px: 1.4,
  py: 0.55,
  transition: 'background-color .22s ease, box-shadow .22s ease',
  '&:hover': { bgcolor: 'rgba(225,29,72,0.16)', boxShadow: '0 10px 22px -12px rgba(225,29,72,0.8)' },
  '& .MuiButton-endIcon': { transition: 'transform .22s ease' },
  '&:hover .MuiButton-endIcon': { transform: 'translateX(3px)' },
};

const QUICK_ACTIONS = [
  'Add Product (Master)',
  'Opening Purchase Entry',
  'POS Sale (Entry)',
  'Trial Balance (Report)',
];

const GO_FORWARD = [
  { title: 'Product Reg', body: 'Register products and set up inventory.', path: '/master/products', icon: <InventoryIcon /> },
  { title: 'Opening Purchase Entry', body: 'Enter opening purchase quantities and cost.', path: '/entry/opening-purchase', icon: <AddBoxIcon /> },
  { title: 'POS Sales', body: 'Point of sale and daily sales.', path: '/entry/pos', icon: <PointOfSaleIcon /> },
];

function Rise({ delay, children, sx }: { delay: number; children: ReactNode; sx?: object }) {
  return (
    <MotionBox
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...ENTER, delay }}
      sx={sx}
    >
      {children}
    </MotionBox>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAppSelector((s) => s.auth.user);
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  return (
    <MotionConfig reducedMotion="user">
      <Box sx={{ maxWidth: 1180, mx: 'auto', pb: 3 }}>
        <Rise delay={0.05}>
          <Box sx={{ ...panel, borderRadius: 5, px: { xs: 2.5, sm: 3.5 }, py: 3.25, mb: 2.5 }}>
            <Box sx={{ ...accentBar, transform: 'none' }} />
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                bgcolor: ROSE_SOFT,
                color: ROSE_DEEP,
                borderRadius: '999px',
                px: 1.25,
                py: 0.5,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              <NexoraSymbol size={14} animated={false} />
              Company workspace
            </Box>
            <Typography variant="h4" sx={{ fontWeight: 800, color: INK, letterSpacing: -0.8, fontSize: 30, mt: 1.75 }}>
              Dashboard
            </Typography>
            <Typography variant="body2" sx={{ color: SUB, mt: 0.75, maxWidth: 620, lineHeight: 1.7 }}>
              Welcome, {user?.fullName ?? user?.username}. Your company and financial year are selected. Use the menu or the links
              below to go forward.
            </Typography>
          </Box>
        </Rise>

        <Grid container spacing={2.5}>
          <Grid item xs={12} md={4}>
            <Rise delay={0.12} sx={{ height: '100%' }}>
              <Box sx={{ ...panel, '&:hover .nx-accent': { transform: 'scaleX(1)' } }}>
                <Box className="nx-accent" sx={accentBar} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={iconTile}>
                    <BusinessIcon fontSize="small" />
                  </Box>
                  <Box>
                    <Box sx={tileLabel}>Company</Box>
                    <Box sx={{ fontSize: 16, fontWeight: 700, color: INK, letterSpacing: '-0.02em', mt: 0.3 }}>
                      {companyId ? 'Selected' : 'Not selected'}
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ mt: 1.25 }}>
                  <Box component="span" sx={statusChip(Boolean(companyId))}>
                    {companyId ? 'Access granted' : 'No company linked'}
                  </Box>
                </Box>
                <Button
                  size="small"
                  endIcon={<ArrowForwardRoundedIcon fontSize="small" />}
                  onClick={() => navigate('/file/company-details')}
                  sx={linkBtn}
                >
                  Company Details
                </Button>
              </Box>
            </Rise>
          </Grid>

          <Grid item xs={12} md={4}>
            <Rise delay={0.18} sx={{ height: '100%' }}>
              <Box sx={{ ...panel, '&:hover .nx-accent': { transform: 'scaleX(1)' } }}>
                <Box className="nx-accent" sx={accentBar} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Box sx={iconTile}>
                    <CalendarMonthIcon fontSize="small" />
                  </Box>
                  <Box>
                    <Box sx={tileLabel}>Financial Year</Box>
                    <Box sx={{ fontSize: 16, fontWeight: 700, color: INK, letterSpacing: '-0.02em', mt: 0.3 }}>
                      {financialYearId ? 'Selected' : 'Not selected'}
                    </Box>
                  </Box>
                </Box>
                <Box sx={{ mt: 1.25 }}>
                  <Box component="span" sx={statusChip(Boolean(financialYearId))}>
                    {financialYearId ? 'Books open' : 'Pick a year'}
                  </Box>
                </Box>
                <Button
                  size="small"
                  endIcon={<ArrowForwardRoundedIcon fontSize="small" />}
                  onClick={() => navigate('/file/change-financial-year')}
                  sx={linkBtn}
                >
                  Change Financial Year
                </Button>
              </Box>
            </Rise>
          </Grid>

          <Grid item xs={12} md={4}>
            <Rise delay={0.24} sx={{ height: '100%' }}>
              <Box sx={{ ...panel, '&:hover .nx-accent': { transform: 'scaleX(1)' } }}>
                <Box className="nx-accent" sx={accentBar} />
                <Box sx={tileLabel}>Quick Actions</Box>
                <Box sx={{ mt: 1.25, display: 'grid', gap: 0.9 }}>
                  {QUICK_ACTIONS.map((label, i) => (
                    <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1.1 }}>
                      <Box
                        component="span"
                        sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: i === 0 ? ROSE : 'rgba(225,29,72,0.35)', flexShrink: 0 }}
                      />
                      <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 600, color: INK }}>
                        {label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Rise>
          </Grid>
        </Grid>

        <Rise delay={0.3}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 3.5, mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: INK, letterSpacing: '-0.02em', fontSize: 17 }}>
              Go forward
            </Typography>
            <Box sx={{ flex: 1, height: 1, bgcolor: LINE }} />
          </Box>
        </Rise>

        <Grid container spacing={2.5}>
          {GO_FORWARD.map((tile, i) => (
            <Grid item xs={12} sm={6} md={4} key={tile.path}>
              <Rise delay={0.34 + i * 0.06} sx={{ height: '100%' }}>
                <MotionBox
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.994 }}
                  onClick={() => navigate(tile.path)}
                  sx={{
                    ...panel,
                    cursor: 'pointer',
                    transition: 'border-color .22s ease, box-shadow .22s ease',
                    '&:hover': { borderColor: 'rgba(225,29,72,0.42)', boxShadow: '0 22px 44px -20px rgba(120,53,15,0.34)' },
                    '&:hover .nx-accent': { transform: 'scaleX(1)' },
                    '&:hover .nx-tile': { bgcolor: ROSE, color: '#FFFFFF' },
                  }}
                >
                  <Box className="nx-accent" sx={accentBar} />
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box className="nx-tile" sx={{ ...iconTile, transition: 'background-color .22s ease, color .22s ease' }}>
                      {tile.icon}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: INK, fontSize: 15, letterSpacing: '-0.01em' }}>
                        {tile.title}
                      </Typography>
                      <Typography variant="body2" sx={{ color: SUB, mt: 0.5, lineHeight: 1.65, fontSize: 13 }}>
                        {tile.body}
                      </Typography>
                    </Box>
                  </Box>
                </MotionBox>
              </Rise>
            </Grid>
          ))}
        </Grid>
      </Box>
    </MotionConfig>
  );
}
