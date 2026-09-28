import { Router } from 'express';
import authRoutes from './authRoutes';
import companyRoutes from './companyRoutes';
import financialYearRoutes from './financialYearRoutes';
import productRoutes from './productRoutes';
import openingStockRoutes from './openingStockRoutes';
import salesRoutes from './salesRoutes';
import purchaseRoutes from './purchaseRoutes';
import stockRoutes from './stockRoutes';
import ledgerRoutes from './ledgerRoutes';
import voucherRoutes from './voucherRoutes';
import ledgerAccountRoutes from './ledgerAccountRoutes';
import ledgerGroupRoutes from './ledgerGroupRoutes';
import userRoutes from './userRoutes';
import auditLogRoutes from './auditLogRoutes';
import backupRoutes from './backupRoutes';
import restoreRoutes from './restoreRoutes';
import purchaseOrderRoutes from './purchaseOrderRoutes';
import purchaseReturnRoutes from './purchaseReturnRoutes';
import billReferenceRoutes from './billReferenceRoutes';
import bankReconciliationRoutes from './bankReconciliationRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/companies', companyRoutes);
router.use('/financial-years', financialYearRoutes);
router.use('/products', productRoutes);
router.use('/opening-stock', openingStockRoutes);
router.use('/sales', salesRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/stock', stockRoutes);
router.use('/ledger', ledgerRoutes);
router.use('/vouchers', voucherRoutes);
router.use('/ledger-accounts', ledgerAccountRoutes);
router.use('/ledger-groups', ledgerGroupRoutes);
router.use('/audit-logs', auditLogRoutes);
router.use('/backup', backupRoutes);
router.use('/restore', restoreRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/purchase-returns', purchaseReturnRoutes);
router.use('/bill-references', billReferenceRoutes);
router.use('/bank-reconciliation', bankReconciliationRoutes);

router.get('/health', (_req, res) => res.json({ ok: true }));

export default router;
