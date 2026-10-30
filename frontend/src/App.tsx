import { Routes, Route, Navigate } from 'react-router-dom';
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
import PurchaseReturn from './pages/PurchaseReturn';
import OpeningBalance from './pages/OpeningBalance';
import BankReconciliation from './pages/BankReconciliation';
import DamageWastage from './pages/DamageWastage';
import BulkBarcodePrint from './pages/BulkBarcodePrint';
import EventReport from './pages/EventReport';
import ProductListReport from './pages/reports/ProductListReport';
import UnitList from './pages/reports/UnitList';
import CustomerListReport from './pages/reports/CustomerListReport';
import SupplierListReport from './pages/reports/SupplierListReport';
import OpeningPurchaseList from './pages/reports/OpeningPurchaseList';
import OtherLedgerList from './pages/reports/OtherLedgerList';
import GroupListReport from './pages/reports/GroupListReport';
import CashBook from './pages/reports/CashBook';
import DayBook from './pages/reports/DayBook';
import PurchaseReport from './pages/reports/PurchaseReport';
import SalesReport from './pages/reports/SalesReport';
import StockReport from './pages/reports/StockReport';
import StockLedgerReport from './pages/reports/StockLedgerReport';
import PLSalesReport from './pages/reports/PLSalesReport';
import OpeningPurchaseReport from './pages/reports/OpeningPurchaseReport';
import PurchaseReturnReport from './pages/reports/PurchaseReturnReport';
import SalesReturnReport from './pages/reports/SalesReturnReport';
import ProductMovementReport from './pages/reports/ProductMovementReport';
import ProductTransactionDetails from './pages/reports/ProductTransactionDetails';
import RiayatiStatusReport from './pages/reports/RiayatiStatusReport';
import Backup from './pages/utilities/Backup';
import Restore from './pages/utilities/Restore';
import BarcodeDesign from './pages/utilities/BarcodeDesign';
import BarcodePrint from './pages/utilities/BarcodePrint';
import Hl7MockListener from './pages/utilities/Hl7MockListener';
import BackupShortcut from './pages/help/BackupShortcut';
import RestoreShortcut from './pages/help/RestoreShortcut';
import ImportOpeningPurchase from './pages/help/ImportOpeningPurchase';
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
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="file/companies" element={<CompanyList />} />
        <Route path="file/companies/create" element={<CompanyCreate />} />
        <Route path="file/company-details" element={<CompanyDetails />} />
        <Route path="file/users" element={<UserList />} />
        <Route path="file/users/create" element={<UserCreate />} />
        <Route path="file/users/credentials" element={<UserCredentials />} />
        <Route path="file/users/permissions" element={<UserPermissions />} />
        <Route path="file/change-financial-year" element={<ChangeFinancialYear />} />
        <Route path="file/software-settings" element={<SoftwareSettings />} />

        <Route path="master/products" element={<ProductList />} />
        <Route path="master/products/create" element={<ProductCreate />} />
        <Route path="master/products/management" element={<ProductManagement />} />
        <Route path="master/customers" element={<CustomerList />} />
        <Route path="master/customer-create" element={<CustomerCreate />} />
        <Route path="master/suppliers" element={<SupplierList />} />
        <Route path="master/supplier-create" element={<SupplierCreate />} />
        <Route path="master/ledger-accounts" element={<LedgerAccountList />} />
        <Route path="master/other-ledger-create" element={<OtherLedgerCreate />} />
        <Route path="master/groups" element={<GroupList />} />
        <Route path="master/groups/create" element={<GroupCreate />} />
        <Route path="master/chart-of-accounts" element={<ChartOfAccounts />} />
        <Route path="master/stock-adjustment" element={<StockAdjustment />} />

        <Route path="entry/opening-stock" element={<PurchaseEntry />} />
        <Route path="entry/opening-purchase" element={<PurchaseEntry />} />
        <Route path="entry/opening-balance" element={<OpeningBalance />} />
        <Route path="entry/pos" element={<POS />} />
        <Route path="entry/sales-b2c" element={<SalesB2C />} />
        <Route path="entry/sales-b2b" element={<SalesB2C />} />
        <Route path="entry/quotation-sales" element={<SalesB2C />} />
        <Route path="entry/sales-return" element={<SalesReturn />} />
        <Route path="entry/purchase" element={<PurchaseEntry />} />
        <Route path="entry/purchase-order" element={<PurchaseEntry />} />
        <Route path="entry/purchase-return" element={<PurchaseReturn />} />
        <Route path="entry/voucher" element={<Navigate to="/entry/voucher/receipt" replace />} />
        <Route path="entry/voucher/:type" element={<VoucherByType />} />
        <Route path="entry/bank-reconciliation" element={<BankReconciliation />} />
        <Route path="entry/damage-wastage" element={<DamageWastage />} />
        <Route path="entry/stock-adjustment" element={<StockAdjustment />} />
        <Route path="entry/bulk-barcode-print" element={<BulkBarcodePrint />} />

        <Route path="report/product-list" element={<ProductListReport />} />
        <Route path="report/product-transaction-details" element={<ProductTransactionDetails />} />
        <Route path="reports/product-transaction-details" element={<ProductTransactionDetails />} />
        <Route path="report/unit-list" element={<UnitList />} />
        <Route path="report/customer-list" element={<CustomerListReport />} />
        <Route path="report/supplier-list" element={<SupplierListReport />} />
        <Route path="report/opening-purchase-list" element={<OpeningPurchaseList />} />
        <Route path="report/opening-stock-list" element={<OpeningPurchaseList />} />
        <Route path="report/other-ledger-list" element={<OtherLedgerList />} />
        <Route path="report/ledger" element={<LedgerReport />} />
        <Route path="report/group-list" element={<GroupListReport />} />
        <Route path="report/cash-book" element={<CashBook />} />
        <Route path="report/day-book" element={<DayBook />} />
        <Route path="reports/day-book" element={<DayBook />} />
        <Route path="report/trial-balance" element={<TrialBalance />} />
        <Route path="report/profit-loss" element={<ProfitLoss />} />
        <Route path="report/balance-sheet" element={<BalanceSheet />} />
        <Route path="reports/balance-sheet" element={<BalanceSheet />} />
        <Route path="report/purchase-report" element={<PurchaseReport />} />
        <Route path="report/sales-report" element={<SalesReport />} />
        <Route path="report/stock-report" element={<StockReport />} />
        <Route path="report/stock-ledger" element={<StockLedgerReport />} />
        <Route path="report/pl-sales" element={<PLSalesReport />} />
        <Route path="report/opening-purchase-report" element={<OpeningPurchaseReport />} />
        <Route path="report/opening-stock-report" element={<OpeningPurchaseReport />} />
        <Route path="report/purchase-return-report" element={<PurchaseReturnReport />} />
        <Route path="report/sales-return-report" element={<SalesReturnReport />} />
        <Route path="report/product-movement" element={<ProductMovementReport />} />
        <Route path="report/event-report" element={<EventReport />} />
        <Route path="report/riayati-status" element={<RiayatiStatusReport />} />

        <Route path="utilities/backup" element={<Backup />} />
        <Route path="utilities/restore" element={<Restore />} />
        <Route path="utilities/barcode-design" element={<BarcodeDesign />} />
        <Route path="utilities/barcode-print" element={<BarcodePrint />} />
        <Route path="utilities/hl7-mock-listener" element={<Hl7MockListener />} />

        <Route path="help/backup" element={<BackupShortcut />} />
        <Route path="help/restore" element={<RestoreShortcut />} />
        <Route path="help/import-opening-purchase" element={<ImportOpeningPurchase />} />
        <Route path="help/import-opening-stock" element={<ImportOpeningPurchase />} />
        <Route path="help/user-guide" element={<UserGuide />} />
        <Route path="help/about" element={<AboutSupport />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
