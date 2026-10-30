import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middlewares/auth';
import * as stockAdjustmentService from '../services/stockAdjustmentService';

export const createStockAdjustmentValidators = [
  body('companyId').notEmpty().withMessage('Company ID is required'),
  body('financialYearId').notEmpty().withMessage('Financial year ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required'),
  body('items.*.adjustmentType').isIn(['ADD', 'REDUCE']).withMessage('Adjustment type must be ADD or REDUCE'),
  body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Quantity must be greater than zero'),
];

export async function createStockAdjustment(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?._id?.toString();
    const result = await stockAdjustmentService.createStockAdjustment(req.body, userId);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listStockAdjustments(
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
    const search = req.query.search as string;
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const fromDate = req.query.fromDate as string;
    const toDate = req.query.toDate as string;
    const entryType = (req.query.entryType as any) || undefined;
    const prefix = (req.query.prefix as string) || undefined;
    const productId = (req.query.productId as string) || undefined;

    const data = await stockAdjustmentService.listStockAdjustments(companyId, financialYearId, {
      search,
      page,
      limit,
      fromDate,
      toDate,
      entryType,
      prefix,
      productId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getNextAdjustmentNo(
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
    const prefix = (req.query.prefix as string) || (req.query.entryType === 'DAMAGE' ? 'DMG' : 'ADJ');
    const adjustmentNo = await stockAdjustmentService.getNextAdjustmentNo(companyId, financialYearId, prefix);
    res.json({ success: true, data: { adjustmentNo } });
  } catch (err) {
    next(err);
  }
}

export async function getStockAdjustmentById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await stockAdjustmentService.getStockAdjustmentById(id, companyId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Stock adjustment not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteStockAdjustment(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const userId = req.user?._id?.toString();
    await stockAdjustmentService.deleteStockAdjustment(id, companyId, userId);
    res.json({ success: true, message: 'Stock adjustment deleted successfully' });
  } catch (err) {
    next(err);
  }
}

export async function updateStockAdjustment(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id;
    const userId = req.user?._id?.toString();
    const result = await stockAdjustmentService.updateStockAdjustment(id, req.body, userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
