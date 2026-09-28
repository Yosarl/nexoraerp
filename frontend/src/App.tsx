import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAppSelector } from './store/hooks';
import Login from './pages/Login';
import MainLayout from './layouts/MainLayout';
import Dashboard from './pages/Dashboard';
import CompanyCreate from './pages/CompanyCreate';
import CompanyList from './pages/CompanyList';
import CompanyDetails from './pages/CompanyDetails';
import ProductList from './pages/ProductList';
import ProductCreate from './pages/ProductCreate';
import ProductManagement from './pages/ProductManagement';
import OpeningStock from './pages/OpeningStock';
import POS from './pages/POS';
import TrialBalance from './pages/TrialBalance';
import LedgerReport from './pages/LedgerReport';
import ProfitLoss from './pages/ProfitLoss';
import BalanceSheet from './pages/BalanceSheet';
import ChangeFinancialYear from './pages/ChangeFinancialYear';
import UserList from './pages/UserList';
import UserCreate from './pages/UserCreate';
import UserCredentials from './pages/UserCredentials';
import UserPermissions from './pages/UserPermissions';
import CustomerList from './pages/CustomerList';
import CustomerCreate from './pages/CustomerCreate';
import SupplierList from './pages/SupplierList';
import SupplierCreate from './pages/SupplierCreate';
import LedgerAccountList from './pages/LedgerAccountList';
import OtherLedgerCreate from './pages/OtherLedgerCreate';
import GroupList from './pages/GroupList';
import GroupCreate from './pages/GroupCreate';
import ChartOfAccounts from './pages/ChartOfAccounts';
import StockAdjustment from './pages/StockAdjustment';
import VoucherByType from './pages/VoucherByType';
import SalesB2C from './pages/SalesB2C';
import SalesReturn from './pages/SalesReturn';
import PurchaseEntry from './pages/PurchaseEntry';
import PurchaseOrderEntry from './pages/PurchaseOrderEntry';
import PurchaseReturn from './pages/PurchaseReturn';
import OpeningBalance from './pages/OpeningBalance';
import BankReconciliation from './pages/BankReconciliation';
import DamageWastage from './pages/DamageWastage';
import EventReport from './pages/EventReport';
import ProductListReport from './pages/reports/ProductListReport';
import UnitList from './pages/reports/UnitList';
import CustomerListReport from './pages/reports/CustomerListReport';
import SupplierListReport from './pages/reports/SupplierListReport';
import OpeningStockList from './pages/reports/OpeningStockList';
import OtherLedgerList from './pages/reports/OtherLedgerList';
import GroupListReport from './pages/reports/GroupListReport';
import CashBook from './pages/reports/CashBook';
import DayBook from './pages/reports/DayBook';
import PurchaseReport from './pages/reports/PurchaseReport';
import SalesReport from './pages/reports/SalesReport';
import StockReport from './pages/reports/StockReport';
import StockLedgerReport from './pages/reports/StockLedgerReport';
import PLSalesReport from './pages/reports/PLSalesReport';
import OpeningStockReport from './pages/reports/OpeningStockReport';
import PurchaseReturnReport from './pages/reports/PurchaseReturnReport';
import SalesReturnReport from './pages/reports/SalesReturnReport';
import ProductMovementReport from './pages/reports/ProductMovementReport';
import Backup from './pages/utilities/Backup';
import Restore from './pages/utilities/Restore';
import BarcodeDesign from './pages/utilities/BarcodeDesign';
import BarcodePrint from './pages/utilities/BarcodePrint';
import BackupShortcut from './pages/help/BackupShortcut';
import RestoreShortcut from './pages/help/RestoreShortcut';
import ImportOpeningStock from './pages/help/ImportOpeningStock';
import UserGuide from './pages/help/UserGuide';
import AboutSupport from './pages/help/AboutSupport';
import SoftwareSettings from './pages/SoftwareSettings';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAppSelector((s) => s.auth.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="file" element={<Outlet />}>
          <Route path="companies" element={<CompanyList />} />
          <Route path="companies/create" element={<CompanyCreate />} />
          <Route path="company-details" element={<CompanyDetails />} />
          <Route path="users" element={<UserList />} />
          <Route path="users/create" element={<UserCreate />} />
          <Route path="users/credentials" element={<UserCredentials />} />
          <Route path="users/permissions" element={<UserPermissions />} />
          <Route path="change-financial-year" element={<ChangeFinancialYear />} />
          <Route path="software-settings" element={<SoftwareSettings />} />
        </Route>
        <Route path="master" element={<Outlet />}>
          <Route path="products" element={<ProductList />} />
          <Route path="products/create" element={<ProductCreate />} />
          <Route path="products/management" element={<ProductManagement />} />
          <Route path="customers" element={<CustomerList />} />
          <Route path="customer-create" element={<CustomerCreate />} />
          <Route path="suppliers" element={<SupplierList />} />
          <Route path="supplier-create" element={<SupplierCreate />} />
          <Route path="ledger-accounts" element={<LedgerAccountList />} />
          <Route path="other-ledger-create" element={<OtherLedgerCreate />} />
          <Route path="groups" element={<GroupList />} />
          <Route path="groups/create" element={<GroupCreate />} />
          <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
          <Route path="stock-adjustment" element={<StockAdjustment />} />
        </Route>
        <Route path="entry" element={<Outlet />}>
          <Route path="opening-stock" element={<OpeningStock />} />
          <Route path="opening-balance" element={<OpeningBalance />} />
          <Route path="pos" element={<POS />} />
          <Route path="sales-b2c" element={<SalesB2C />} />
          <Route path="sales-b2b" element={<SalesB2C />} />
          <Route path="quotation-sales" element={<SalesB2C />} />
          <Route path="sales-return" element={<SalesReturn />} />
          <Route path="purchase" element={<PurchaseEntry />} />
          <Route path="purchase-order" element={<PurchaseOrderEntry />} />
          <Route path="purchase-return" element={<PurchaseReturn />} />
          <Route path="voucher" element={<Navigate to="/entry/voucher/receipt" replace />} />
          <Route path="voucher/:type" element={<VoucherByType />} />
          <Route path="bank-reconciliation" element={<BankReconciliation />} />
          <Route path="damage-wastage" element={<DamageWastage />} />
        </Route>
        <Route path="report" element={<Outlet />}>
          <Route path="product-list" element={<ProductListReport />} />
          <Route path="unit-list" element={<UnitList />} />
          <Route path="customer-list" element={<CustomerListReport />} />
          <Route path="supplier-list" element={<SupplierListReport />} />
          <Route path="opening-stock-list" element={<OpeningStockList />} />
          <Route path="other-ledger-list" element={<OtherLedgerList />} />
          <Route path="ledger" element={<LedgerReport />} />
          <Route path="group-list" element={<GroupListReport />} />
          <Route path="cash-book" element={<CashBook />} />
          <Route path="day-book" element={<DayBook />} />
          <Route path="trial-balance" element={<TrialBalance />} />
          <Route path="profit-loss" element={<ProfitLoss />} />
          <Route path="balance-sheet" element={<BalanceSheet />} />
          <Route path="purchase-report" element={<PurchaseReport />} />
          <Route path="sales-report" element={<SalesReport />} />
          <Route path="stock-report" element={<StockReport />} />
          <Route path="stock-ledger" element={<StockLedgerReport />} />
          <Route path="pl-sales" element={<PLSalesReport />} />
          <Route path="opening-stock-report" element={<OpeningStockReport />} />
          <Route path="purchase-return-report" element={<PurchaseReturnReport />} />
          <Route path="sales-return-report" element={<SalesReturnReport />} />
          <Route path="product-movement" element={<ProductMovementReport />} />
          <Route path="event-report" element={<EventReport />} />
        </Route>
        <Route path="utilities" element={<Outlet />}>
          <Route path="backup" element={<Backup />} />
          <Route path="restore" element={<Restore />} />
          <Route path="barcode-design" element={<BarcodeDesign />} />
          <Route path="barcode-print" element={<BarcodePrint />} />
        </Route>
        <Route path="help" element={<Outlet />}>
          <Route path="backup" element={<BackupShortcut />} />
          <Route path="restore" element={<RestoreShortcut />} />
          <Route path="import-opening-stock" element={<ImportOpeningStock />} />
          <Route path="user-guide" element={<UserGuide />} />
          <Route path="about" element={<AboutSupport />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
