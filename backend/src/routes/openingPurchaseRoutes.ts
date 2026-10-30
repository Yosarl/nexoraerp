import { Router } from 'express';
import * as openingPurchaseController from '../controllers/openingPurchaseController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  validate(openingPurchaseController.postOpeningStockValidators),
  openingPurchaseController.postOpeningStock
);

router.post(
  '/import',
  validate(openingPurchaseController.importOpeningStockValidators),
  openingPurchaseController.importOpeningStock
);

// Document-based entries (list, get, create, update)
router.get('/entries', openingPurchaseController.listOpeningStockEntries);
router.get('/entries/next-entry-no', openingPurchaseController.getNextOpeningStockEntryNo);
router.get('/entries/:id', openingPurchaseController.getOpeningStockEntryById);
router.post(
  '/entries',
  validate(openingPurchaseController.createOpeningStockEntryValidators),
  openingPurchaseController.createOpeningStockEntry
);
router.put(
  '/entries/:id',
  validate(openingPurchaseController.createOpeningStockEntryValidators),
  openingPurchaseController.updateOpeningStockEntry
);
router.delete('/entries/:id', openingPurchaseController.deleteOpeningStockEntry);

export default router;
