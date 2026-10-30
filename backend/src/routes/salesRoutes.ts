import { Router } from 'express';
import * as salesController from '../controllers/salesController';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const router = Router();

router.use(authenticate);

// POS routes
router.get('/pos/next-invoice-no', salesController.getNextPOSInvoiceNo);
router.post(
  '/pos',
  validate(salesController.createPOSValidators),
  salesController.createPOSSale
);
// Sales Report
router.get('/report', salesController.getSalesReport);

router.get('/invoices/:id', salesController.getInvoice);

// Product-customer transaction history
router.get('/b2c/product-history/:productId', salesController.getProductCustomerHistory);

// B2C routes
router.get('/b2c/next-invoice-no', salesController.getNextB2CInvoiceNo);
router.get('/b2c/search', salesController.searchB2CByInvoiceNo);
router.get('/b2c', salesController.listB2CInvoices);
router.get('/b2c/:id', salesController.getB2CInvoice);
router.post(
  '/b2c',
  validate(salesController.createB2CValidators),
  salesController.createB2CSale
);
router.put('/b2c/:id', salesController.updateB2CSale);
router.delete('/b2c/:id', salesController.deleteB2CSale);

// Sales Return
router.get('/return/next-invoice-no', salesController.getNextReturnInvoiceNo);
router.get('/return/search', salesController.searchSalesReturnByInvoiceNo);
router.get('/returns', salesController.listSalesReturns);
router.get('/return/:id', salesController.getSalesReturn);
router.post(
  '/return',
  validate(salesController.createSalesReturnValidators),
  salesController.createSalesReturn
);
router.put(
  '/return/:id',
  validate(salesController.createSalesReturnValidators),
  salesController.updateSalesReturn
);
// Doctor routes
router.get('/doctors', salesController.listDoctors);
router.post('/doctors', salesController.createDoctor);

// Patient routes
router.get('/patients', salesController.listPatients);
router.get('/patients/by-emirates-id', salesController.findPatientByEmiratesId);
router.post('/patients', salesController.createPatient);

export default router;

