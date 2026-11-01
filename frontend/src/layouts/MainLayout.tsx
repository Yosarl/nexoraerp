import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation, useOutlet, UNSAFE_LocationContext, NavigationType } from 'react-router-dom';
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
import HubIcon from '@mui/icons-material/Hub';
import MinimizeIcon from '@mui/icons-material/Minimize';
import CloseIcon from '@mui/icons-material/Close';
import Button from '@mui/material/Button';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import LayersIcon from '@mui/icons-material/Layers';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import SearchIcon from '@mui/icons-material/Search';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { logout } from '../store/slices/authSlice';
import { toggleDrawer, setDrawerOpen, setCompany } from '../store/slices/appSlice';
import { NexoraSymbol } from '../components/NexoraLogo';
import {
  AMBER,
  CARD_BORDER,
  FAINT,
  GRAD,
  GRAD_HOVER,
  HAIRLINE,
  INK,
  INK_GRAD,
  LEDGER_RULES,
  LINE,
  PAPER,
  PAPER_BG,
  PAPER_WARM,
  ROSE,
  ROSE_DEEP,
  ROSE_SOFT,
  SUB,
} from '../theme/nexora';

const W = 280;

const navItemSx = {
  mx: 1,
  my: 0.15,
  px: 1,
  borderRadius: 1.6,
  transition: 'background-color .16s ease, box-shadow .16s ease',
  '& .MuiListItemIcon-root': { minWidth: 34, color: SUB, transition: 'color .16s ease' },
  '&:hover': { bgcolor: PAPER_WARM, '& .MuiListItemIcon-root': { color: ROSE } },
  '&.Mui-selected': {
    bgcolor: ROSE_SOFT,
    boxShadow: `inset 3px 0 0 ${ROSE}`,
    '& .MuiListItemText-primary': { color: ROSE_DEEP, fontWeight: 700 },
    '& .MuiListItemIcon-root': { color: ROSE },
    '&:hover': { bgcolor: 'rgba(225,29,72,0.12)' },
  },
};

const sectionHeadSx = {
  py: 0.6,
  mt: 0.75,
  borderRadius: 1.6,
  '&:hover': { bgcolor: 'transparent' },
  '& .MuiSvgIcon-root': { color: FAINT },
};

const drawerPaperSx = {
  width: W,
  top: 36,
  height: 'calc(100% - 36px)',
  boxSizing: 'border-box' as const,
  bgcolor: PAPER,
  borderRight: `1px solid ${LINE}`,
  backgroundImage: LEDGER_RULES,
  boxShadow: '26px 0 60px -28px rgba(120,53,15,0.45)',
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 20,
    width: 1.5,
    background: 'rgba(225,29,72,0.22)',
    pointerEvents: 'none' as const,
  },
};

const quickBtn = (hoverMax: number) => ({
  all: 'unset' as const,
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
  color: 'rgba(255,255,255,0.82)',
  transition: 'all 0.2s',
  whiteSpace: 'nowrap' as const,
  overflow: 'hidden' as const,
  maxWidth: 22,
  '&:hover': { maxWidth: hoverMax, bgcolor: 'rgba(225,29,72,0.26)', color: '#fff', px: 0.8 },
  '&:active': { bgcolor: 'rgba(225,29,72,0.4)' },
  '& .btn-label': { opacity: 0, ml: 0, transition: 'opacity 0.2s, margin 0.2s' },
  '&:hover .btn-label': { opacity: 1, ml: 0.3 },
});

type MenuItemDef = { label: string; path?: string; icon?: React.ReactNode; action?: 'logout'; permission?: string };
type SectionDef = { title: string; items: MenuItemDef[] };

export interface StoredWindow {
  path: string;
  title: string;
  openedAt: number;
}

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
      { label: 'Opening Purchase Entry', path: '/entry/opening-purchase', icon: <ShoppingCartIcon /> },
      { label: 'Opening Balance', path: '/entry/opening-balance', icon: <AccountTreeIcon /> },
      { label: 'Receipt Voucher', path: '/entry/voucher/receipt', icon: <ReceiptIcon /> },
      { label: 'Payment Voucher', path: '/entry/voucher/payment', icon: <ReceiptIcon /> },
      { label: 'Contra Voucher', path: '/entry/voucher/contra', icon: <CompareArrowsIcon /> },
      { label: 'Journal Voucher', path: '/entry/voucher/journal', icon: <AccountTreeIcon /> },
      { label: 'Cheque Payment', path: '/entry/voucher/cheque-payment', icon: <ReceiptIcon /> },
      { label: 'Cheque Receipt', path: '/entry/voucher/cheque-receipt', icon: <ReceiptIcon /> },
      { label: 'Bank Reconciliation', path: '/entry/bank-reconciliation', icon: <AccountBalanceIcon /> },
      { label: 'Damage / Wastage Entry', path: '/entry/damage-wastage', icon: <InventoryIcon /> },
      { label: 'Bulk Barcode Print', path: '/entry/bulk-barcode-print', icon: <QrCode2Icon /> },
    ],
  },
  {
    title: 'REPORT',
    items: [
      { label: 'Product List', path: '/report/product-list', icon: <ListAltIcon /> },
      { label: 'Product Transaction Details', path: '/report/product-transaction-details', icon: <AssessmentIcon /> },
      { label: 'Unit List', path: '/report/unit-list', icon: <ListAltIcon /> },
      { label: 'Customer List', path: '/report/customer-list', icon: <ListAltIcon /> },
      { label: 'Supplier List', path: '/report/supplier-list', icon: <ListAltIcon /> },
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
      { label: 'Event Report', path: '/report/event-report', icon: <AssessmentIcon /> },
      { label: 'Riayati Status', path: '/report/riayati-status', icon: <HubIcon /> },
    ],
  },
  {
    title: 'UTILITIES',
    items: [
      { label: 'Backup', path: '/utilities/backup', icon: <BackupIcon />, permission: 'utilities.backup' },
      { label: 'Restore', path: '/utilities/restore', icon: <RestoreIcon />, permission: 'utilities.restore' },
      { label: 'Barcode Design', path: '/utilities/barcode-design', icon: <QrCode2Icon /> },
      { label: 'Barcode Print', path: '/utilities/barcode-print', icon: <PrintIcon /> },
      { label: 'HL7 Mock Listener', path: '/utilities/hl7-mock-listener', icon: <HubIcon /> },
    ],
  },
  {
    title: 'HELP',
    items: [
      { label: 'Backup Database (shortcut)', path: '/help/backup', icon: <BackupIcon /> },
      { label: 'Restore Database (shortcut)', path: '/help/restore', icon: <RestoreIcon /> },
      { label: 'Import Opening Purchase Products', path: '/help/import-opening-purchase', icon: <CloudUploadIcon /> },
      { label: 'User Guide / Documentation', path: '/help/user-guide', icon: <MenuBookIcon /> },
      { label: 'About / Support', path: '/help/about', icon: <InfoIcon /> },
    ],
  },
];

const isUncachedPath = (path: string): boolean => {
  return !path || path === '/' || path === '/login' || path === '/dashboard';
};

class WindowErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; resetKey?: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Window error caught:', error, errorInfo);
  }

  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" color="error" gutterBottom>
            Something went wrong in this window
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Typography>
          <Button
            variant="contained"
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: '12px',
              background: GRAD,
              boxShadow: '0 14px 30px -10px rgba(225,29,72,0.55)',
              '&:hover': { background: GRAD_HOVER },
            }}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.hash = '#/dashboard';
            }}
          >
            Go to Dashboard
          </Button>
        </Box>
      );
    }
    return this.props.children;
  }
}

export default function MainLayout() {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [windowSearchInput, setWindowSearchInput] = useState('');
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

  // Auto-initialize selectedCompanyId if missing but user has company access
  useEffect(() => {
    if (!cid && user?.companyAccess && user.companyAccess.length > 0) {
      const saved = localStorage.getItem('selectedCompanyId');
      const targetId = (saved && user.companyAccess.includes(saved)) ? saved : user.companyAccess[0];
      dispatch(setCompany(targetId));
    }
  }, [cid, user?.companyAccess, dispatch]);

  // When drawer closes, move focus to menu button before paint so focus is not inside
  // an element that gets aria-hidden (avoids "Blocked aria-hidden" a11y warning).
  useLayoutEffect(() => {
    if (wasOpenRef.current && !open) {
      wasOpenRef.current = false;
      menuButtonRef.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open]);

  // When menu (drawer) is open, clicking anywhere in the application minimizes/closes it
  useEffect(() => {
    if (!open) return;

    const handleGlobalClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // If clicked inside the drawer paper, don't close
      const drawerPaper = document.querySelector('.MuiDrawer-paper');
      if (drawerPaper && drawerPaper.contains(target)) {
        return;
      }

      // If clicked on the menu toggle button, let toggleDrawer handle it
      if (menuButtonRef.current && menuButtonRef.current.contains(target)) {
        return;
      }

      // Clicked anywhere else in the application -> minimize/close the menu window
      dispatch(setDrawerOpen(false));
    };

    document.addEventListener('mousedown', handleGlobalClick, true);
    document.addEventListener('touchstart', handleGlobalClick, true);

    return () => {
      document.removeEventListener('mousedown', handleGlobalClick, true);
      document.removeEventListener('touchstart', handleGlobalClick, true);
    };
  }, [open, dispatch]);

  const [storedWindows, setStoredWindows] = useState<StoredWindow[]>(() => {
    try {
      localStorage.removeItem('supermarket_open_windows');
      const saved = sessionStorage.getItem('supermarket_open_windows');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((w: any) => w && w.path && !isUncachedPath(w.path)).slice(0, 5);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [windowsAnchor, setWindowsAnchor] = useState<null | HTMLElement>(null);
  const outlet = useOutlet();
  const windowCacheRef = useRef(new Map<string, { element: React.ReactNode; location: any; instanceId: string }>());
  const mainContentRef = useRef<HTMLDivElement>(null);
  const scrollPositionsRef = useRef(new Map<string, number>());
  const prevPathRef = useRef<string>(loc.pathname);

  // Preserve and isolate scroll positions per window tab to prevent scroll bleed between windows
  useLayoutEffect(() => {
    const prevPath = prevPathRef.current;
    const currentPath = loc.pathname;

    if (prevPath !== currentPath) {
      if (prevPath && mainContentRef.current) {
        scrollPositionsRef.current.set(prevPath, mainContentRef.current.scrollTop);
      }
      if (prevPath) {
        scrollPositionsRef.current.set(`${prevPath}__window`, window.scrollY || document.documentElement.scrollTop || 0);
      }
      prevPathRef.current = currentPath;

      const hasCreatedState = !!(loc.state as any)?.createdLedgerName;
      const targetScroll = hasCreatedState ? 0 : (scrollPositionsRef.current.get(currentPath) || 0);
      const targetWindowScroll = hasCreatedState ? 0 : (scrollPositionsRef.current.get(`${currentPath}__window`) || 0);

      if (mainContentRef.current) {
        mainContentRef.current.scrollTop = targetScroll;
      }
      window.scrollTo({ top: targetWindowScroll, behavior: 'instant' as ScrollBehavior });
    }
  }, [loc.pathname, loc.state]);

  // Clean up all window state when user closes application / reloads
  useEffect(() => {
    try {
      localStorage.removeItem('supermarket_open_windows');
    } catch {
      // ignore
    }

    const handleAppClose = () => {
      try {
        localStorage.removeItem('supermarket_open_windows');
        sessionStorage.removeItem('supermarket_open_windows');
        windowCacheRef.current.clear();
        scrollPositionsRef.current.clear();
      } catch {
        // ignore
      }
    };

    window.addEventListener('beforeunload', handleAppClose);
    window.addEventListener('pagehide', handleAppClose);

    return () => {
      window.removeEventListener('beforeunload', handleAppClose);
      window.removeEventListener('pagehide', handleAppClose);
    };
  }, []);

  const resolveWindowTitle = (pathname: string): string => {
    for (const sec of menuSections) {
      for (const it of sec.items) {
        if (it.path === pathname) return it.label;
      }
    }
    if (pathname === '/dashboard') return 'Dashboard';
    if (pathname === '/entry/sales-b2c') return 'Sales B2C';
    if (pathname === '/entry/purchase') return 'Purchase Entry';
    if (pathname === '/entry/purchase-order') return 'Purchase Order';
    if (pathname === '/entry/purchase-return') return 'Purchase Return';
    if (pathname === '/entry/sales-return') return 'Sales Return';
    if (pathname === '/entry/quotation-sales') return 'Sales Order';
    if (pathname === '/report/stock-report') return 'Stock Report';
    if (pathname === '/report/riayati-status') return 'Riayati Status';
    if (pathname === '/utilities/hl7-mock-listener') return 'HL7 Mock Listener';
    if (pathname === '/settings') return 'Settings';

    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return 'Dashboard';
    const last = segments[segments.length - 1];
    return last
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  };

  useEffect(() => {
    const currentPath = loc.pathname;
    if (isUncachedPath(currentPath)) return;

    const title = resolveWindowTitle(currentPath);

    setStoredWindows((prev) => {
      const existingIdx = prev.findIndex((w) => w.path === currentPath);
      if (existingIdx !== -1) {
        // Already exists: bring to end (most recent)
        const updated = [...prev];
        const [existing] = updated.splice(existingIdx, 1);
        updated.push({ ...existing, openedAt: Date.now() });
        return updated;
      }

      // New window: store up to 5; after 5, clear the first window and add new window
      const nextList = [...prev];
      if (nextList.length >= 5) {
        const evicted = nextList.shift();
        if (evicted) windowCacheRef.current.delete(evicted.path);
      }
      nextList.push({ path: currentPath, title, openedAt: Date.now() });
      return nextList;
    });

    window.dispatchEvent(new CustomEvent('app:window-activated', { detail: { path: currentPath } }));
  }, [loc.pathname]);

  useEffect(() => {
    try {
      if (storedWindows.length > 0) {
        sessionStorage.setItem('supermarket_open_windows', JSON.stringify(storedWindows));
      } else {
        sessionStorage.removeItem('supermarket_open_windows');
      }
    } catch {
      // ignore
    }
  }, [storedWindows]);

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

  const cleanupStuckOverlays = () => {
    try {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      const root = document.getElementById('root');
      if (root?.getAttribute('aria-hidden') === 'true') {
        root.removeAttribute('aria-hidden');
      }
    } catch {
      // ignore
    }
  };

  const handleClearAllWindows = () => {
    setWindowsAnchor(null);
    windowCacheRef.current.clear();
    scrollPositionsRef.current.clear();
    setStoredWindows([]);
    try {
      sessionStorage.removeItem('supermarket_open_windows');
      localStorage.removeItem('supermarket_open_windows');
    } catch {
      // ignore
    }
    dispatch(setDrawerOpen(false));
    cleanupStuckOverlays();
    navigate('/dashboard');
  };

  const handleCloseWindow = (targetPath: string) => {
    setWindowsAnchor(null);
    windowCacheRef.current.delete(targetPath);
    scrollPositionsRef.current.delete(targetPath);
    scrollPositionsRef.current.delete(`${targetPath}__window`);
    const remaining = storedWindows.filter((w) => w.path !== targetPath);
    setStoredWindows(remaining);
    try {
      if (remaining.length > 0) {
        sessionStorage.setItem('supermarket_open_windows', JSON.stringify(remaining));
      } else {
        sessionStorage.removeItem('supermarket_open_windows');
      }
    } catch {
      // ignore
    }

    if (loc.pathname === targetPath) {
      dispatch(setDrawerOpen(false));
      cleanupStuckOverlays();
      if (remaining.length > 0) {
        navigate(remaining[remaining.length - 1].path);
      } else {
        navigate('/dashboard');
      }
    }
  };

  const navigateToWindow = (path: string) => {
    const isSame = loc.pathname === path;
    navigate(path);
    dispatch(setDrawerOpen(false));
    if (isSame) {
      window.dispatchEvent(new CustomEvent('app:window-activated', { detail: { path } }));
    }
  };

  const handleNav = (item: MenuItemDef) => {
    if (item.action === 'logout') {
      windowCacheRef.current.clear();
      scrollPositionsRef.current.clear();
      setStoredWindows([]);
      try {
        sessionStorage.removeItem('supermarket_open_windows');
        localStorage.removeItem('supermarket_open_windows');
      } catch {
        // ignore
      }
      dispatch(logout());
      navigate('/login');
      setAnchor(null);
      dispatch(setDrawerOpen(false));
      return;
    }
    if (item.path) {
      navigateToWindow(item.path);
    }
  };

  // Keep-alive: cache the current outlet for the current path
  const currentPath = loc.pathname;
  if (outlet && !isUncachedPath(currentPath)) {
    if (!windowCacheRef.current.has(currentPath)) {
      const instanceId = `${currentPath}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      windowCacheRef.current.set(currentPath, { element: outlet, location: { ...loc }, instanceId });
    } else {
      // Update frozen location in case state/search params changed
      const entry = windowCacheRef.current.get(currentPath);
      if (entry) entry.location = { ...loc };
    }
  }

  // Ensure windowCacheRef only contains paths currently present in storedWindows
  const activePaths = new Set(storedWindows.map((w) => w.path));
  for (const p of Array.from(windowCacheRef.current.keys())) {
    // Keep the just-cached current window: storedWindows catches up in the effect below,
    // and dropping it here remounts the page (doubling every init request)
    if (!activePaths.has(p) && p !== currentPath) {
      windowCacheRef.current.delete(p);
    }
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: 1201,
          background: INK_GRAD,
          boxShadow: '0 10px 26px -12px rgba(15,23,42,0.55)',
          '&::after': { content: '""', position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: GRAD },
        }}
      >
        <Toolbar variant="dense" sx={{ minHeight: 36, height: 36, px: 1.5 }}>
          <IconButton ref={menuButtonRef} color="inherit" onClick={() => dispatch(toggleDrawer())} edge="start" sx={{ mr: 1 }} aria-label="Toggle menu"><MenuIcon fontSize="small" /></IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.85, mr: 1.5 }}>
            <NexoraSymbol size={19} animated={false} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '0.9rem', letterSpacing: '-0.01em' }}>Supermarket (UAE)</Typography>
          </Box>
          <Box
            component="button"
            onClick={() => navigateToWindow('/entry/sales-b2c')}
            title="Sales B2C"
            sx={quickBtn(100)}
          >
            <PointOfSaleIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Sales B2C</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigateToWindow('/entry/sales-return')}
            title="Sales Return"
            sx={quickBtn(100)}
          >
            <AssignmentReturnIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Sales Return</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigateToWindow('/entry/purchase')}
            title="Purchase Entry"
            sx={quickBtn(120)}
          >
            <ShoppingCartIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Purchase Entry</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigateToWindow('/entry/purchase-order')}
            title="Purchase Order"
            sx={quickBtn(120)}
          >
            <ListAltIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Purchase Order</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigateToWindow('/entry/purchase-return')}
            title="Purchase Return"
            sx={quickBtn(120)}
          >
            <AssignmentReturnIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Purchase Return</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigateToWindow('/entry/quotation-sales')}
            title="Sales Order"
            sx={quickBtn(100)}
          >
            <ListAltIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Sales Order</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigateToWindow('/report/stock-report')}
            title="Stock Report"
            sx={quickBtn(110)}
          >
            <InventoryIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Stock Report</span>
          </Box>
          <Box
            component="button"
            onClick={() => navigateToWindow('/report/ledger')}
            title="Ledger Report"
            sx={quickBtn(140)}
          >
            <AccountTreeIcon sx={{ fontSize: 16, flexShrink: 0 }} />
            <span className="btn-label">Ledger Report</span>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          {/* Quick Window Search Bar */}
          <Box sx={{ mr: 1.5, width: { xs: 150, sm: 200, md: 240 } }}>
            <Autocomplete
              size="small"
              options={menuSections.flatMap((sec) =>
                sec.items
                  .filter((it) => it.path && canAccess(it))
                  .map((it) => ({
                    label: it.label,
                    path: it.path!,
                    section: sec.title,
                  }))
              )}
              groupBy={(option) => option.section}
              getOptionLabel={(option) => typeof option === 'string' ? option : option.label}
              inputValue={windowSearchInput}
              onInputChange={(_, newInputValue) => setWindowSearchInput(newInputValue)}
              onChange={(_, value) => {
                if (value && typeof value !== 'string' && value.path) {
                  navigate(value.path);
                  setWindowSearchInput('');
                  dispatch(setDrawerOpen(false));
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Open window... (Ctrl+K)"
                  variant="outlined"
                  size="small"
                  InputProps={{
                    ...params.InputProps,
                    startAdornment: (
                      <InputAdornment position="start" sx={{ mr: 0.5 }}>
                        <SearchIcon sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 16 }} />
                      </InputAdornment>
                    ),
                    sx: {
                      height: 26,
                      fontSize: '0.75rem',
                      color: '#ffffff',
                      bgcolor: 'rgba(255, 255, 255, 0.15)',
                      borderRadius: 1.2,
                      px: 0.8,
                      transition: 'background-color .22s ease, box-shadow .22s ease',
                      '&:hover': {
                        bgcolor: 'rgba(255, 255, 255, 0.22)',
                      },
                      '&.Mui-focused': {
                        bgcolor: 'rgba(255, 255, 255, 0.28)',
                        boxShadow: '0 0 0 2px rgba(244,63,94,0.6)',
                      },
                      '& fieldset': { border: 'none' },
                      '& input': {
                        py: 0,
                        height: '100%',
                        fontSize: '0.75rem',
                        color: '#ffffff',
                        '&::placeholder': {
                          color: 'rgba(255, 255, 255, 0.7)',
                          opacity: 1,
                        },
                      },
                      '& .MuiAutocomplete-endAdornment': {
                        top: 'calc(50% - 9px)',
                        '& .MuiSvgIcon-root': {
                          color: 'rgba(255,255,255,0.7)',
                          fontSize: 14,
                        },
                      },
                    },
                  }}
                />
              )}
              renderOption={(props, option) => (
                <Box
                  component="li"
                  {...props}
                  key={option.path}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem',
                    py: 0.6,
                    px: 1.2,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: ROSE_SOFT },
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', fontWeight: 600, color: INK }}>
                    {option.label}
                  </Typography>
                  <Typography variant="caption" sx={{ fontSize: '0.68rem', color: SUB, ml: 1 }}>
                    {option.section}
                  </Typography>
                </Box>
              )}
              componentsProps={{
                paper: {
                  sx: {
                    borderRadius: 2,
                    border: CARD_BORDER,
                    boxShadow: '0 22px 48px -18px rgba(120,53,15,0.35)',
                    bgcolor: PAPER,
                    fontSize: '0.78rem',
                    mt: 0.5,
                    '& .MuiAutocomplete-groupLabel': {
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: ROSE_DEEP,
                      bgcolor: PAPER_WARM,
                      py: 0.3,
                      px: 1.2,
                      lineHeight: '22px',
                    },
                  },
                },
              }}
            />
          </Box>
          {/* Windows Button & Dropdown */}
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 1.5 }}>
            <Tooltip title="Active Windows (max 5)">
              <Button
                size="small"
                onClick={(e) => setWindowsAnchor(e.currentTarget)}
                startIcon={<LayersIcon sx={{ fontSize: 16 }} />}
                endIcon={<ExpandMore sx={{ fontSize: 14 }} />}
                sx={{
                  color: '#ffffff',
                  textTransform: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  bgcolor: Boolean(windowsAnchor) ? 'rgba(225,29,72,0.34)' : 'rgba(255,255,255,0.14)',
                  '&:hover': { bgcolor: 'rgba(225,29,72,0.24)' },
                  borderRadius: 1.2,
                  px: 1,
                  py: 0.2,
                  height: 26,
                  lineHeight: 1,
                  transition: 'background-color .22s ease',
                }}
              >
                Windows
                <Box
                  component="span"
                  sx={{
                    ml: 0.6,
                    px: 0.6,
                    py: 0.1,
                    borderRadius: 1,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    bgcolor: storedWindows.length === 5 ? AMBER : 'rgba(255,255,255,0.22)',
                    color: '#ffffff',
                  }}
                >
                  {storedWindows.length}/5
                </Box>
              </Button>
            </Tooltip>

            <Menu
              anchorEl={windowsAnchor}
              open={Boolean(windowsAnchor)}
              onClose={() => setWindowsAnchor(null)}
              PaperProps={{
                sx: {
                  width: 310,
                  borderRadius: 2.5,
                  boxShadow: '0 26px 54px -20px rgba(120,53,15,0.42)',
                  mt: 0.8,
                  p: 0,
                  overflow: 'hidden',
                  border: CARD_BORDER,
                  bgcolor: PAPER,
                },
              }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <Box
                sx={{
                  position: 'relative',
                  px: 2,
                  py: 1.4,
                  pt: 1.6,
                  bgcolor: PAPER_WARM,
                  borderBottom: `1px solid ${HAIRLINE}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: GRAD },
                }}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, color: INK, fontSize: '0.85rem', letterSpacing: '-0.01em' }}>
                    Open Windows ({storedWindows.length}/5)
                  </Typography>
                  <Typography variant="caption" sx={{ color: SUB, fontSize: '0.7rem' }}>
                    Stores up to 5 windows (FIFO queue)
                  </Typography>
                </Box>
                {storedWindows.length > 0 && (
                  <Button
                    size="small"
                    onClick={handleClearAllWindows}
                    sx={{
                      fontSize: '0.7rem',
                      textTransform: 'none',
                      py: 0.2,
                      px: 0.8,
                      color: ROSE_DEEP,
                      fontWeight: 700,
                      borderRadius: 1.2,
                      '&:hover': { bgcolor: ROSE_SOFT },
                    }}
                  >
                    Clear All
                  </Button>
                )}
              </Box>

              <Box sx={{ maxHeight: 290, overflowY: 'auto' }}>
                {storedWindows.length === 0 ? (
                  <Box sx={{ py: 3, textAlign: 'center', color: FAINT }}>
                    <LayersIcon sx={{ fontSize: 32, mb: 0.5, color: 'rgba(30,41,59,0.16)' }} />
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                      No active windows stored yet
                    </Typography>
                    <Typography variant="caption">
                      Navigate to any page to store it here
                    </Typography>
                  </Box>
                ) : (
                  storedWindows.map((win, idx) => {
                    const isActive = loc.pathname === win.path;
                    return (
                      <MenuItem
                        key={win.path + idx}
                        onClick={() => {
                          setWindowsAnchor(null);
                          navigateToWindow(win.path);
                        }}
                        sx={{
                          py: 1,
                          px: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          bgcolor: isActive ? ROSE_SOFT : 'transparent',
                          borderLeft: isActive ? `3px solid ${ROSE}` : '3px solid transparent',
                          transition: 'background-color .18s ease',
                          '&:hover': {
                            bgcolor: isActive ? 'rgba(225,29,72,0.14)' : PAPER_WARM,
                          },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
                          <Box
                            sx={{
                              width: 18,
                              height: 18,
                              borderRadius: 0.8,
                              bgcolor: isActive ? ROSE : 'rgba(30,41,59,0.08)',
                              color: isActive ? '#ffffff' : SUB,
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {idx + 1}
                          </Box>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: isActive ? 700 : 500,
                                color: isActive ? ROSE_DEEP : INK,
                                fontSize: '0.82rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {win.title}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                color: FAINT,
                                fontSize: '0.68rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: 'block',
                              }}
                            >
                              {win.path}
                            </Typography>
                          </Box>
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                          {isActive && (
                            <Chip
                              label="Active"
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                bgcolor: ROSE_SOFT,
                                color: ROSE_DEEP,
                              }}
                            />
                          )}
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCloseWindow(win.path);
                            }}
                            title="Close window & clear state"
                            sx={{
                              p: 0.4,
                              color: FAINT,
                              '&:hover': { color: ROSE, bgcolor: 'rgba(225,29,72,0.1)' },
                            }}
                          >
                            <CloseIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Box>
                      </MenuItem>
                    );
                  })
                )}
              </Box>
            </Menu>
          </Box>
          {cid && <Typography variant="caption" sx={{ mr: 1.5, color: 'rgba(255,255,255,0.72)' }}>Company</Typography>}
          <IconButton
            color="inherit"
            size="small"
            onClick={(e) => setAnchor(e.currentTarget)}
            sx={{
              px: 1,
              py: 0.25,
              height: 26,
              borderRadius: 999,
              bgcolor: 'rgba(255,255,255,0.14)',
              transition: 'background-color .22s ease',
              '&:hover': { bgcolor: 'rgba(225,29,72,0.28)' },
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 600 }}>{user?.fullName ?? user?.username ?? 'User'}</Typography>
          </IconButton>
          <Menu
            anchorEl={anchor}
            open={!!anchor}
            onClose={() => setAnchor(null)}
            PaperProps={{ sx: { borderRadius: 2, border: CARD_BORDER, bgcolor: PAPER, boxShadow: '0 22px 48px -18px rgba(120,53,15,0.35)' } }}
          >
            <MenuItem
              onClick={() => { dispatch(logout()); navigate('/login'); setAnchor(null); }}
              sx={{ '& .MuiListItemIcon-root': { color: ROSE, minWidth: 34 }, '&:hover': { bgcolor: ROSE_SOFT } }}
            >
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
        onClose={() => dispatch(setDrawerOpen(false))}
        ModalProps={{ keepMounted: true }}
        sx={{ zIndex: 1200, '& .MuiDrawer-paper': drawerPaperSx, '& .MuiBackdrop-root': { top: 36, bgcolor: 'rgba(15,23,42,0.42)' } }}
      >
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 1.5,
            py: 1,
            pl: 2.6,
            borderBottom: `1px solid ${HAIRLINE}`,
            bgcolor: PAPER_WARM,
            backgroundImage: 'none',
            flexShrink: 0,
            '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: GRAD },
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 800, color: ROSE_DEEP, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Menu Navigation
          </Typography>
          <IconButton size="small" onClick={() => dispatch(setDrawerOpen(false))} title="Minimize menu" sx={{ color: SUB, '&:hover': { color: ROSE, bgcolor: ROSE_SOFT } }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>
        <List sx={{ py: 0.5, overflow: 'auto' }}>
          {hasCompany && (
            <ListItemButton
              selected={loc.pathname === '/'}
              onClick={() => {
                navigate('/');
                dispatch(setDrawerOpen(false));
              }}
              sx={navItemSx}
            >
              <ListItemIcon><DashboardIcon /></ListItemIcon>
              <ListItemText primary="Dashboard" primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }} />
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
                <ListItemButton onClick={() => toggleSection(sec.title)} sx={{ ...sectionHeadSx, px: 2.6 }}>
                  <ListItemText
                    primary={sec.title}
                    primaryTypographyProps={{
                      variant: 'caption',
                      fontWeight: 800,
                      sx: { letterSpacing: '0.14em', color: SUB },
                    }}
                  />
                  {expanded[sec.title] ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>
                <Collapse in={expanded[sec.title]} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding dense>
                    {items.map((item) => (
                      <ListItemButton
                        key={item.label}
                        selected={item.path ? loc.pathname === item.path : false}
                        onClick={() => handleNav(item)}
                        sx={{ ...navItemSx, pl: 2 }}
                      >
                        {item.icon && <ListItemIcon>{item.icon}</ListItemIcon>}
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
        ref={mainContentRef}
        sx={{
          flexGrow: 1,
          p: 1.5,
          mt: '44px',
          width: '100%',
          minWidth: 0,
          overflow: 'auto',
          bgcolor: PAPER,
          backgroundImage: PAPER_BG,
          backgroundAttachment: 'fixed',
        }}
      >
        {/* Keep-alive: render all cached windows, show only the active one */}
        {Array.from(windowCacheRef.current.entries()).map(([path, cached]) => (
          <Box
            key={cached.instanceId || path}
            sx={{ display: path === loc.pathname ? 'block' : 'none', height: '100%', width: '100%' }}
          >
            <WindowErrorBoundary resetKey={cached.instanceId || path}>
              <UNSAFE_LocationContext.Provider value={{ location: path === loc.pathname ? loc : cached.location, navigationType: NavigationType.Pop }}>
                {cached.element}
              </UNSAFE_LocationContext.Provider>
            </WindowErrorBoundary>
          </Box>
        ))}
        {/* Fallback for uncached paths (dashboard, login, etc.) */}
        {!windowCacheRef.current.has(loc.pathname) && (
          <WindowErrorBoundary resetKey={loc.pathname}>
            {outlet}
          </WindowErrorBoundary>
        )}
      </Box>
    </Box>
  );
}
