import { Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import { AuthRequest } from '../middlewares/auth';
import * as salesService from '../services/salesService';
import { validate } from '../middlewares/validate';

export const createPOSValidators = [
  body('companyId').notEmpty().withMessage('Company ID is required'),
  body('financialYearId').notEmpty().withMessage('Financial year ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required'),
  body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Quantity is required'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price is required'),
  body('paymentDetails').isArray({ min: 1 }).withMessage('At least one payment is required'),
  body('paymentDetails.*.mode').notEmpty().withMessage('Payment mode is required'),
  body('paymentDetails.*.amount').isFloat({ min: 0 }).withMessage('Payment amount is required'),
];

export const createB2CValidators = [
  body('companyId').notEmpty().withMessage('Company ID is required'),
  body('financialYearId').notEmpty().withMessage('Financial year ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required'),
  body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Quantity is required'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price is required'),
];

export async function createPOSSale(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!._id.toString();
    const result = await salesService.createPOSSale({ ...req.body, createdBy: userId });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getInvoice(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const invoiceId = req.params.id;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await salesService.getInvoice(invoiceId, companyId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ==================== B2C Controllers ====================

export async function getNextB2CInvoiceNo(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const type = (req.query.type as 'B2C' | 'B2B' | 'Quotation') || 'B2C';
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'Company ID and Financial Year ID required' });
      return;
    }
    const invoiceNo = await salesService.getNextB2CInvoiceNo(companyId, financialYearId, type);
    res.json({ success: true, data: { invoiceNo } });
  } catch (err) {
    next(err);
  }
}

export async function createB2CSale(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!._id.toString();
    const result = await salesService.createB2CSale({ ...req.body, createdBy: userId });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateB2CSale(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const invoiceId = req.params.id;
    const companyId = req.body.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const userId = req.user!._id.toString();
    const result = await salesService.updateB2CSale(invoiceId, companyId, req.body, userId);
    if (!result) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function deleteB2CSale(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const invoiceId = req.params.id;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const success = await salesService.deleteB2CSale(invoiceId, companyId);
    if (!success) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (err) {
    next(err);
  }
}

export async function listB2CInvoices(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'Company ID and Financial Year ID required' });
      return;
    }
    const opts = {
      search: req.query.search as string,
      fromDate: req.query.fromDate as string,
      toDate: req.query.toDate as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 20,
      type: req.query.type as 'B2C' | 'B2B' | 'Quotation' | undefined,
    };
    const data = await salesService.listB2CInvoices(companyId, financialYearId, opts);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getB2CInvoice(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const invoiceId = req.params.id;
    const companyId = req.query.companyId as string;
    const type = req.query.type as 'B2C' | 'B2B' | 'Quotation' | undefined;
    const excludeReturnId = req.query.excludeReturnId as string | undefined;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await salesService.getB2CInvoice(invoiceId, companyId, type, excludeReturnId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getProductCustomerHistory(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const productId = req.params.productId as string;
    const customerId = req.query.customerId as string | undefined;
    const type = req.query.type as 'POS' | 'B2C' | 'B2B' | 'Quotation' | undefined;
    if (!companyId || !productId) {
      res.status(400).json({ success: false, message: 'Company ID and Product ID required' });
      return;
    }
    const data = await salesService.getProductCustomerHistory(companyId, productId, customerId, type);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function searchB2CByInvoiceNo(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const invoiceNo = req.query.invoiceNo as string;
    const type = req.query.type as 'B2C' | 'B2B' | 'Quotation' | undefined;
    const excludeReturnId = req.query.excludeReturnId as string | undefined;
    if (!companyId || !invoiceNo) {
      res.status(400).json({ success: false, message: 'Company ID and Invoice No required' });
      return;
    }
    const data = await salesService.searchB2CByInvoiceNo(companyId, invoiceNo, type, excludeReturnId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Invoice not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

// ─── Sales Return ────────────────────────────────────────────────────

export const createSalesReturnValidators = [
  body('companyId').notEmpty().withMessage('Company ID is required'),
  body('financialYearId').notEmpty().withMessage('Financial year ID is required'),
  body('returnType').isIn(['OnAccount', 'ByRef']).withMessage('Return type must be OnAccount or ByRef'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required'),
  body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Quantity is required'),
  body('items.*.unitPrice').isFloat({ min: 0 }).withMessage('Unit price is required'),
];

export async function getNextReturnInvoiceNo(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'Company ID and Financial Year ID required' });
      return;
    }
    const invoiceNo = await salesService.getNextReturnInvoiceNo(companyId, financialYearId);
    res.json({ success: true, data: { invoiceNo } });
  } catch (err) {
    next(err);
  }
}

export async function createSalesReturn(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!._id.toString();
    const result = await salesService.createSalesReturn({ ...req.body, createdBy: userId });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function searchSalesReturnByInvoiceNo(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const invoiceNo = req.query.invoiceNo as string;
    if (!companyId || !invoiceNo?.trim()) {
      res.status(400).json({ success: false, message: 'Company ID and Invoice No required' });
      return;
    }
    const data = await salesService.searchSalesReturnByInvoiceNo(companyId, invoiceNo.trim());
    if (!data) {
      res.status(404).json({ success: false, message: 'Sales return not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listSalesReturns(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'Company ID and Financial Year ID required' });
      return;
    }
    const data = await salesService.listSalesReturns(companyId, financialYearId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSalesReturn(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const invoiceId = req.params.id;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await salesService.getSalesReturn(invoiceId, companyId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Sales return not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateSalesReturn(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const invoiceId = req.params.id;
    const companyId = req.body.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const userId = req.user!._id.toString();
    const result = await salesService.updateSalesReturn(invoiceId, companyId, { ...req.body, createdBy: userId }, userId);
    if (!result) {
      res.status(404).json({ success: false, message: 'Sales return not found' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function deleteSalesReturn(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const invoiceId = req.params.id;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const success = await salesService.deleteSalesReturn(invoiceId, companyId);
    if (!success) {
      res.status(404).json({ success: false, message: 'Sales return not found' });
      return;
    }
    res.json({ success: true, message: 'Sales return deleted' });
  } catch (err) {
    next(err);
  }
}
