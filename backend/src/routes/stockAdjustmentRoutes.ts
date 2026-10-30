import { Router } from 'express';
import * as stockAdjustmentController from '../controllers/stockAdjustmentController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const router = Router();

router.use(authenticate);

router.get('/next-no', stockAdjustmentController.getNextAdjustmentNo);
router.get('/', stockAdjustmentController.listStockAdjustments);
router.get('/:id', stockAdjustmentController.getStockAdjustmentById);
router.post(
  '/',
  validate(stockAdjustmentController.createStockAdjustmentValidators),
  stockAdjustmentController.createStockAdjustment
);
router.put(
  '/:id',
  validate(stockAdjustmentController.createStockAdjustmentValidators),
  stockAdjustmentController.updateStockAdjustment
);
router.delete('/:id', stockAdjustmentController.deleteStockAdjustment);

export default router;
