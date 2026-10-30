import { Router } from 'express';
import * as stockController from '../controllers/stockController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

router.get('/report', stockController.getStockReport);
router.get('/movement', stockController.getStockMovement);
router.get('/ledger', stockController.getStockMovement);
router.get('/product-stock/:productId', stockController.getProductStock);
router.get('/product-transactions/:productId', stockController.getProductTransactions);

export default router;
