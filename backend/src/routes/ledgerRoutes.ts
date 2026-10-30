import { Router } from 'express';
import * as ledgerController from '../controllers/ledgerController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/entries-by-voucher', ledgerController.getEntriesByVoucher);
router.get('/report', ledgerController.getLedgerReport);
router.get('/trial-balance', ledgerController.getTrialBalance);
router.get('/trial-balance/export', ledgerController.exportTrialBalance);
router.get('/day-book', ledgerController.getDayBook);
router.get('/day-book/export', ledgerController.exportDayBook);
router.get('/profit-loss', ledgerController.getProfitLoss);
router.get('/profit-loss/export', ledgerController.exportProfitLoss);
router.get('/balance-sheet', ledgerController.getBalanceSheet);

export default router;
