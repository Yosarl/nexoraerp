import { Router } from 'express';
import * as purchaseController from '../controllers/purchaseController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const router = Router();

router.use(authenticate);

// List all purchase invoices
router.get('/', purchaseController.listPurchases);

// Get next invoice number
router.get('/next-invoice-no', purchaseController.getNextInvoiceNo);

// Get next batch number (00001, 00002, ...)
router.get('/next-batch-no', purchaseController.getNextBatchNo);

// Search by invoice number
router.get('/search', purchaseController.searchPurchase);

// Get batches for a product
router.get('/product-batches/:productId', purchaseController.getProductBatches);

// Purchase Report
router.get('/report', purchaseController.getPurchaseReport);

// Get single purchase by ID
router.get('/:id', purchaseController.getPurchaseById);

// Create new purchase
router.post(
  '/',
  validate(purchaseController.createPurchaseValidators),
  purchaseController.createPurchase
);

// Update existing purchase
router.put(
  '/:id',
  validate(purchaseController.createPurchaseValidators),
  purchaseController.updatePurchase
);

export default router;
