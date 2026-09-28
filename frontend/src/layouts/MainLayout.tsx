import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BusinessIcon from '@mui/icons-material/Business';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import InventoryIcon from '@mui/icons-material/Inventory';
import AddIcon from '@mui/icons-material/Add';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AssessmentIcon from '@mui/icons-material/Assessment';
import LogoutIcon from '@mui/icons-material/Logout';
import PeopleIcon from '@mui/icons-material/People';
import LockIcon from '@mui/icons-material/Lock';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import ListAltIcon from '@mui/icons-material/ListAlt';
import BackupIcon from '@mui/icons-material/Backup';
import RestoreIcon from '@mui/icons-material/Restore';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import PrintIcon from '@mui/icons-material/Print';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import InfoIcon from '@mui/icons-material/Info';
import SettingsIcon from '@mui/icons-material/Settings';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CloseIcon from '@mui/icons-material/Close';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout } from '../store/slices/authSlice';
import { toggleDrawer } from '../store/slices/appSlice';

const W = 280;

type MenuItemDef = { label: string; path?: string; icon?: React.ReactNode; action?: 'logout'; permission?: string };
type SectionDef = { title: string; items: MenuItemDef[] };

const menuSections: SectionDef[] = [
  {
    title: 'FILE',
    items: [
      { label: 'Company Details', path: '/file/company-details', icon: <BusinessIcon /> },
      { label: 'User Management', path: '/file/users', icon: <PeopleIcon /> },
      { label: 'Create User', path: '/file/users/create', icon: <AddIcon /> },
      { label: 'Update User Credentials', path: '/file/users/credentials', icon: <LockIcon /> },
      { label: 'User Permissions', path: '/file/users/permissions', icon: <LockIcon /> },
      { label: 'Change Financial Year', path: '/file/change-financial-year', icon: <CalendarMonthIcon /> },
      { label: 'Software Settings', path: '/file/software-settings', icon: <SettingsIcon /> },
      { label: 'Exit', icon: <LogoutIcon />, action: 'logout' },
    ],
  },
  {
    title: 'MASTER',
    items: [
      { label: 'Customer Reg', path: '/master/customer-create', icon: <BusinessIcon /> },
      { label: 'Supplier Reg', path: '/master/supplier-create', icon: <BusinessIcon /> },
      { label: 'Other Ledger Reg', path: '/master/other-ledger-create', icon: <AccountTreeIcon /> },
      { label: 'Group Reg', path: '/master/groups/create', icon: <AccountTreeIcon /> },
      { label: 'Chart of Accounts', path: '/master/chart-of-accounts', icon: <AccountTreeIcon /> },
      { label: 'Product Reg', path: '/master/products/create', icon: <InventoryIcon /> },
      { label: 'Product Management', path: '/master/products/management', icon: <InventoryIcon /> },
      { label: 'Stock Adjustment', path: '/master/stock-adjustment', icon: <InventoryIcon /> },
    ],
  },
  {
    title: 'ENTRY',
    items: [
      { label: 'POS Sales', path: '/entry/pos', icon: <PointOfSaleIcon /> },
      { label: 'Sales B2C', path: '/entry/sales-b2c', icon: <ReceiptIcon /> },
      { label: 'Sales B2B', path: '/entry/sales-b2b', icon: <ReceiptIcon /> },
      { label: 'Quotation Sales', path: '/entry/quotation-sales', icon: <ReceiptIcon /> },
      { label: 'Sales Return', path: '/entry/sales-return', icon: <ReceiptIcon /> },
      { label: 'Purchase Entry', path: '/entry/purchase', icon: <ShoppingCartIcon /> },
      { label: 'Purchase Order Entry', path: '/entry/purchase-order', icon: <ShoppingCartIcon /> },
      { label: 'Purchase Return', path: '/entry/purchase-return', icon: <ShoppingCartIcon /> },
      { label: 'Opening Stock', path: '/entry/opening-stock', icon: <InventoryIcon /> },
      { label: 'Opening Balance', path: '/entry/opening-balance', icon: <AccountTreeIcon /> },
      { label: 'Receipt Voucher', path: '/entry/voucher/receipt', icon: <ReceiptIcon /> },
      { label: 'Payment Voucher', path: '/entry/voucher/payment', icon: <ReceiptIcon /> },
      { label: 'Contra Voucher', path: '/entry/voucher/contra', icon: <CompareArrowsIcon /> },
      { label: 'Journal Voucher', path: '/entry/voucher/journal', icon: <AccountTreeIcon /> },
      { label: 'Cheque Payment', path: '/entry/voucher/cheque-payment', icon: <ReceiptIcon /> },
      { label: 'Cheque Receipt', path: '/entry/voucher/cheque-receipt', icon: <ReceiptIcon /> },
      { label: 'Bank Reconciliation', path: '/entry/bank-reconciliation', icon: <AccountBalanceIcon /> },
      { label: 'Damage / Wastage Entry', path: '/entry/damage-wastage', icon: <InventoryIcon /> },
    ],
  },
  {
    title: 'REPORT',
    items: [
      { label: 'Product List', path: '/report/product-list', icon: <ListAltIcon /> },
      { label: 'Unit List', path: '/report/unit-list', icon: <ListAltIcon /> },
      { label: 'Customer List', path: '/report/customer-list', icon: <ListAltIcon /> },
      { label: 'Supplier List', path: '/report/supplier-list', icon: <ListAltIcon /> },
      { label: 'Opening Stock List', path: '/report/opening-stock-list', icon: <ListAltIcon /> },
      { label: 'Other Ledger List', path: '/report/other-ledger-list', icon: <ListAltIcon /> },
      { label: 'Ledger Report', path: '/report/ledger', icon: <AssessmentIcon /> },
      { label: 'Group List', path: '/report/group-list', icon: <AssessmentIcon /> },
      { label: 'Cash Book', path: '/report/cash-book', icon: <AssessmentIcon /> },
      { label: 'Day Book', path: '/report/day-book', icon: <AssessmentIcon /> },
      { label: 'Trial Balance', path: '/report/trial-balance', icon: <AssessmentIcon /> },
      { label: 'Profit & Loss Account', path: '/report/profit-loss', icon: <AssessmentIcon /> },
      { label: 'Balance Sheet', path: '/report/balance-sheet', icon: <AssessmentIcon /> },
      { label: 'Purchase Report', path: '/report/purchase-report', icon: <AssessmentIcon /> },
      { label: 'Sales Report', path: '/report/sales-report', icon: <AssessmentIcon /> },
      { label: 'Stock Report', path: '/report/stock-report', icon: <AssessmentIcon /> },
      { label: 'Stock Ledger Report', path: '/report/stock-ledger', icon: <AssessmentIcon /> },
      { label: 'Profit and Loss in Sales', path: '/report/pl-sales', icon: <AssessmentIcon /> },
      { label: 'Opening Stock Report', path: '/report/opening-stock-report', icon: <AssessmentIcon /> },
      { label: 'Purchase Return Report', path: '/report/purchase-return-report', icon: <AssessmentIcon /> },
      { label: 'Sales Return Report', path: '/report/sales-return-report', icon: <AssessmentIcon /> },
      { label: 'Product Movement Report', path: '/report/product-movement', icon: <AssessmentIcon /> },
      { label: 'Event Report', path: '/report/event-report', icon: <AssessmentIcon /> },
    ],
  },
  {
    title: 'UTILITIES',
    items: [
      { label: 'Backup', path: '/utilities/backup', icon: <BackupIcon />, permission: 'utilities.backup' },
      { label: 'Restore', path: '/utilities/restore', icon: <RestoreIcon />, permission: 'utilities.restore' },
      { label: 'Barcode Design', path: '/utilities/barcode-design', icon: <QrCode2Icon /> },
      { label: 'Barcode Print', path: '/utilities/barcode-print', icon: <PrintIcon /> },
    ],
  },
  {
    title: 'HELP',
    items: [
      { label: 'Backup Database (shortcut)', path: '/help/backup', icon: <BackupIcon /> },
      { label: 'Restore Database (shortcut)', path: '/help/restore', icon: <RestoreIcon /> },
      { label: 'Import Opening Stock Products', path: '/help/import-opening-stock', icon: <CloudUploadIcon /> },
      { label: 'User Guide / Documentation', path: '/help/user-guide', icon: <MenuBookIcon /> },
      { label: 'About / Support', path: '/help/about', icon: <InfoIcon /> },
    ],
  },
];

export default function MainLayout() {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    FILE: true,
    MASTER: true,
    ENTRY: true,
    REPORT: false,
    UTILITIES: true,
    HELP: true,
  });
  const navigate = useNavigate();
  const loc = useLocation();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const cid = useAppSelector((s) => s.app.selectedCompanyId);
  const open = useAppSelector((s) => s.app.drawerOpen);
  const hasCompany = (user?.companyAccess?.length ?? 0) > 0;
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(open);

  // When drawer closes, move focus to menu button before paint so focus is not inside
  // an element that gets aria-hidden (avoids "Blocked aria-hidden" a11y warning).
  useLayoutEffect(() => {
    if (wasOpenRef.current && !open) {
      wasOpenRef.current = false;
      menuButtonRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!user) return;
    if (!hasCompany && loc.pathname !== '/file/companies/create') {
      navigate('/file/companies/create', { replace: true });
    }
  }, [user, hasCompany, loc.pathname, navigate]);

  const canAccess = (item: MenuItemDef): boolean => {
    if (!item.permission) return true;
    if (user?.roles?.includes('Admin')) return true;
    const perms = user?.permissions ?? [];
    return perms.includes('*') || perms.includes(item.permission);
  };

  const toggleSection = (title: string) => {
    setExpanded((e) => ({ ...e, [title]: !e[title] }));
  };

  const handleNav = (item: MenuItemDef) => {
    if (item.action === 'logout') {
      dispatch(logout());
      navigate('/login');
      setAnchor(null);
      return;
    }
    if (item.path) navigate(item.path);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" sx={{ zIndex: 1201 }}>
        <Toolbar variant="dense" sx={{ minHeight: 36, height: 36, px: 1.5 }}>
          <IconButton ref={menuButtonRef} color="inherit" onClick={() => dispatch(toggleDrawer())} edge="start" sx={{ mr: 1 }} aria-label="Toggle menu"><MenuIcon fontSize="small" /></IconButton>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, fontSize: '0.9rem', mr: 1.5 }}>Supermarket (UAE)</Typography>
          <Box
            component="button"
            onClick={() => navigate('/entry/sales-b2c')}
            title="Sales B2C"
            sx={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: 0.5,
              py: 0.2,
              borderRadius: 0.8,
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              maxWidth: 22,
              '&:hover': { maxWidth: 100, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', px: 0.8 },
              '&:active': { bgcolor: 'rgba(255,255,255,0.25)' },
              '& .btn-label': { opacity: 0, ml: 0, transition: 'opacity 0.2s, margin 0.2s' },
              '&:hover .btn-label': { opacity: 1, ml: 0.3 },
            }}
          >
            <PointOfSaleIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Sales B2C</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigate('/entry/sales-return')}
            title="Sales Return"
            sx={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: 0.5,
              py: 0.2,
              ml: 0.5,
              borderRadius: 0.8,
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              maxWidth: 22,
              '&:hover': { maxWidth: 100, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', px: 0.8 },
              '&:active': { bgcolor: 'rgba(255,255,255,0.25)' },
              '& .btn-label': { opacity: 0, ml: 0, transition: 'opacity 0.2s, margin 0.2s' },
              '&:hover .btn-label': { opacity: 1, ml: 0.3 },
            }}
          >
            <AssignmentReturnIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Sales Return</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigate('/entry/purchase')}
            title="Purchase Entry"
            sx={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: 0.5,
              py: 0.2,
              ml: 0.5,
              borderRadius: 0.8,
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              maxWidth: 22,
              '&:hover': { maxWidth: 120, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', px: 0.8 },
              '&:active': { bgcolor: 'rgba(255,255,255,0.25)' },
              '& .btn-label': { opacity: 0, ml: 0, transition: 'opacity 0.2s, margin 0.2s' },
              '&:hover .btn-label': { opacity: 1, ml: 0.3 },
            }}
          >
            <ShoppingCartIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Purchase Entry</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigate('/entry/purchase-order')}
            title="Purchase Order"
            sx={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: 0.5,
              py: 0.2,
              ml: 0.5,
              borderRadius: 0.8,
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              maxWidth: 22,
              '&:hover': { maxWidth: 120, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', px: 0.8 },
              '&:active': { bgcolor: 'rgba(255,255,255,0.25)' },
              '& .btn-label': { opacity: 0, ml: 0, transition: 'opacity 0.2s, margin 0.2s' },
              '&:hover .btn-label': { opacity: 1, ml: 0.3 },
            }}
          >
            <ListAltIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Purchase Order</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigate('/entry/purchase-return')}
            title="Purchase Return"
            sx={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: 0.5,
              py: 0.2,
              ml: 0.5,
              borderRadius: 0.8,
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              maxWidth: 22,
              '&:hover': { maxWidth: 120, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', px: 0.8 },
              '&:active': { bgcolor: 'rgba(255,255,255,0.25)' },
              '& .btn-label': { opacity: 0, ml: 0, transition: 'opacity 0.2s, margin 0.2s' },
              '&:hover .btn-label': { opacity: 1, ml: 0.3 },
            }}
          >
            <AssignmentReturnIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Purchase Return</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigate('/entry/quotation-sales')}
            title="Sales Order"
            sx={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: 0.5,
              py: 0.2,
              ml: 0.5,
              borderRadius: 0.8,
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              maxWidth: 22,
              '&:hover': { maxWidth: 100, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', px: 0.8 },
              '&:active': { bgcolor: 'rgba(255,255,255,0.25)' },
              '& .btn-label': { opacity: 0, ml: 0, transition: 'opacity 0.2s, margin 0.2s' },
              '&:hover .btn-label': { opacity: 1, ml: 0.3 },
            }}
          >
            <ListAltIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Sales Order</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigate('/report/stock-report')}
            title="Stock Report"
            sx={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: 0.5,
              py: 0.2,
              ml: 0.5,
              borderRadius: 0.8,
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              maxWidth: 22,
              '&:hover': { maxWidth: 110, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', px: 0.8 },
              '&:active': { bgcolor: 'rgba(255,255,255,0.25)' },
              '& .btn-label': { opacity: 0, ml: 0, transition: 'opacity 0.2s, margin 0.2s' },
              '&:hover .btn-label': { opacity: 1, ml: 0.3 },
            }}
          >
            <InventoryIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Stock Report</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigate('/report/ledger')}
            title="Ledger Report"
            sx={{
              all: 'unset',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: 0.5,
              py: 0.2,
              ml: 0.5,
              borderRadius: 0.8,
              fontSize: '0.65rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,0.8)',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              maxWidth: 22,
              '&:hover': { maxWidth: 140, bgcolor: 'rgba(255,255,255,0.15)', color: '#fff', px: 0.8 },
              '&:active': { bgcolor: 'rgba(255,255,255,0.25)' },
              '& .btn-label': { opacity: 0, ml: 0, transition: 'opacity 0.2s, margin 0.2s' },
              '&:hover .btn-label': { opacity: 1, ml: 0.3 },
            }}
          >
            <AccountTreeIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Ledger Report</span>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          {cid && <Typography variant="caption" sx={{ mr: 1.5 }}>Company</Typography>}
          <IconButton color="inherit" size="small" onClick={(e) => setAnchor(e.currentTarget)}><Typography variant="caption">{user?.fullName ?? user?.username ?? 'User'}</Typography></IconButton>
          <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
            <MenuItem onClick={() => { dispatch(logout()); navigate('/login'); setAnchor(null); }}>
              <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon> Logout
            </MenuItem>
          </Menu>
          <Box sx={{ ml: 2, display: 'flex', alignItems: 'center', gap: 0, height: 36 }}>
            <Box
              component="button"
              onClick={() => (window as any).electronAPI?.minimizeWindow?.()}
              title="Minimize"
              sx={{
                all: 'unset',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: '100%',
                color: 'white',
                transition: 'background 0.15s',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.12)' },
                '&:active': { bgcolor: 'rgba(255,255,255,0.2)' },
              }}
            >
              <MinimizeIcon sx={{ fontSize: 18 }} />
            </Box>
            <Box
              component="button"
              onClick={() => (window as any).electronAPI?.closeWindow?.()}
              title="Exit"
              sx={{
                all: 'unset',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: '100%',
                color: 'white',
                transition: 'background 0.15s',
                '&:hover': { bgcolor: '#dc2626', color: '#fff' },
                '&:active': { bgcolor: '#b91c1c' },
              }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </Box>
          </Box>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="temporary"
        open={open}
        onClose={() => dispatch(toggleDrawer())}
        ModalProps={{ keepMounted: true }}
        sx={{ zIndex: 1200, '& .MuiDrawer-paper': { width: W, top: 36, height: 'calc(100% - 36px)', boxSizing: 'border-box' }, '& .MuiBackdrop-root': { top: 36 } }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 0, p: 0 }} />
        <List sx={{ py: 0, overflow: 'auto' }}>
          {hasCompany && (
            <ListItemButton selected={loc.pathname === '/'} onClick={() => navigate('/')}>
              <ListItemIcon><DashboardIcon /></ListItemIcon>
              <ListItemText primary="Dashboard" />
            </ListItemButton>
          )}
          {menuSections.map((sec) => {
            const items = hasCompany
              ? sec.items.filter(canAccess)
              : sec.title === 'FILE'
                ? [
                  { label: 'Create Company', path: '/file/companies/create', icon: <BusinessIcon /> },
                  ...sec.items.filter((i) => i.action === 'logout'),
                ]
                : [];
            if (items.length === 0) return null;
            return (
              <Box key={sec.title}>
                <ListItemButton onClick={() => toggleSection(sec.title)} sx={{ py: 0.5 }}>
                  <ListItemText primary={sec.title} primaryTypographyProps={{ variant: 'caption', fontWeight: 700 }} />
                  {expanded[sec.title] ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>
                <Collapse in={expanded[sec.title]} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding dense>
                    {items.map((item) => (
                      <ListItemButton
                        key={item.label}
                        selected={item.path ? loc.pathname === item.path : false}
                        onClick={() => handleNav(item)}
                        sx={{ pl: 2 }}
                      >
                        {item.icon && <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>}
                        <ListItemText
                          primary={item.label}
                          primaryTypographyProps={{
                            variant: 'body2',
                            sx: item.label === 'Bank Reconciliation' ? { fontSize: '0.55rem', lineHeight: 1.2 } : undefined,
                          }}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                </Collapse>
              </Box>
            );
          })}
        </List>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 1.5,
          mt: '44px',
          width: '100%',
          minWidth: 0,
          overflow: 'auto',
        }}
      >
        <Outlet key={loc.pathname} />
      </Box>
    </Box>
  );
}
