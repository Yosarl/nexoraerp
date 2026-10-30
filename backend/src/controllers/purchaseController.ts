import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middlewares/auth';
import * as purchaseService from '../services/purchaseService';

export const createPurchaseValidators = [
  body('companyId').notEmpty().withMessage('Company ID is required'),
  body('financialYearId').notEmpty().withMessage('Financial year ID is required'),
  body('invoiceNo').notEmpty().withMessage('Invoice number is required'),
  body('batches').isArray({ min: 1 }).withMessage('At least one batch is required'),
  body('batches.*.productId').notEmpty().withMessage('Product ID is required'),
  body('batches.*.quantity').isFloat({ min: 0.001 }).withMessage('Quantity is required'),
  body('batches.*.purchasePrice').isFloat({ min: 0 }).withMessage('Purchase price is required'),
];

export async function createPurchase(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!._id.toString();
    const result = await purchaseService.createPurchase({
      ...req.body,
      createdBy: userId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// PUT /purchases/:id
export async function updatePurchase(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!._id.toString();
    const purchaseId = req.params.id;
    const result = await purchaseService.updatePurchase(purchaseId, {
      ...req.body,
      createdBy: userId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// GET /purchases?companyId=...&financialYearId=...
export async function listPurchases(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const financialYearId = req.query.financialYearId as string | undefined;
    const data = await purchaseService.listPurchases(companyId, financialYearId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// GET /purchases/next-invoice-no?companyId=...
export async function getNextInvoiceNo(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const invoiceNo = await purchaseService.getNextInvoiceNo(companyId);
    res.json({ success: true, data: { invoiceNo } });
  } catch (err) {
    next(err);
  }
}

// GET /purchases/next-batch-no?companyId=...
export async function getNextBatchNo(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const batchNumber = await purchaseService.getNextBatchNumber(companyId);
    res.json({ success: true, data: { batchNumber } });
  } catch (err) {
    next(err);
  }
}

// GET /purchases/:id
export async function getPurchaseById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await purchaseService.getPurchaseById(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// GET /purchases/search?companyId=...&invoiceNo=...
export async function searchPurchase(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const invoiceNo = req.query.invoiceNo as string;
    if (!companyId || !invoiceNo) {
      res.status(400).json({ success: false, message: 'Company ID and Invoice No required' });
      return;
    }
    const data = await purchaseService.getPurchaseByInvoiceNo(companyId, invoiceNo);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// GET /purchases/product-batches/:productId?companyId=...
export async function getProductBatches(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const productId = req.params.productId;
    if (!companyId || !productId) {
      res.status(400).json({ success: false, message: 'Company ID and Product ID required' });
      return;
    }
    const batches = await purchaseService.getBatchesByProduct(companyId, productId);
    res.json({ success: true, data: batches });
  } catch (err) {
    next(err);
  }
}

// GET /purchases/report
export async function getPurchaseReport(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = (req.query.companyId as string) || req.companyId;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID is required' });
      return;
    }
    const financialYearId = (req.query.financialYearId as string) || req.financialYearId;
    const {
      filterType = 'default',
      purchaseType = 'Purchase',
      productId,
      fromDate,
      toDate,
      search,
    } = req.query as {
      filterType?: any;
      purchaseType?: string;
      productId?: string;
      fromDate?: string;
      toDate?: string;
      search?: string;
    };

    const data = await purchaseService.getPurchaseReport(companyId, financialYearId, {
      filterType,
      purchaseType,
      productId,
      fromDate,
      toDate,
      search,
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

