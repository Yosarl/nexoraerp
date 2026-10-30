import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middlewares/auth';
import * as openingStockService from '../services/openingPurchaseService';
import { validate } from '../middlewares/validate';

export const postOpeningStockValidators = [
  body('companyId').notEmpty().withMessage('Company ID is required'),
  body('financialYearId').notEmpty().withMessage('Financial year ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').notEmpty().withMessage('Product ID is required'),
  body('items.*.quantity').isFloat({ min: 0 }).withMessage('Quantity must be non-negative'),
  body('items.*.costPrice').isFloat({ min: 0 }).withMessage('Cost price must be non-negative'),
];

export async function postOpeningStock(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { companyId, financialYearId, items } = req.body;
    const userId = req.user!._id.toString();
    const result = await openingStockService.postOpeningStock(companyId, financialYearId, items, userId);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export const importOpeningStockValidators = [
  body('companyId').notEmpty().withMessage('Company ID is required'),
  body('financialYearId').notEmpty().withMessage('Financial year ID is required'),
  body('mapping').isObject().withMessage('Mapping is required'),
  body('mapping.quantity').isInt({ min: 0 }).withMessage('Quantity column index required'),
  body('mapping.cost').isInt({ min: 0 }).withMessage('Cost column index required'),
  body('rows').isArray().withMessage('Rows array is required'),
];

export async function importOpeningStock(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { companyId, financialYearId, mapping, rows } = req.body;
    const userId = req.user!._id.toString();
    const result = await openingStockService.importProductsAndOpeningStock(
      companyId,
      financialYearId,
      mapping,
      rows,
      userId
    );
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── Document-based Opening Stock Entry (list / get / create / update) ───

export const createOpeningStockEntryValidators = [
  body('companyId').notEmpty().withMessage('Company ID is required'),
  body('financialYearId').notEmpty().withMessage('Financial year ID is required'),
  body('batches').isArray({ min: 1 }).withMessage('At least one batch is required'),
  body('batches.*.productId').notEmpty().withMessage('Product ID is required'),
  body('batches.*.quantity').isFloat({ min: 0.001 }).withMessage('Quantity is required'),
  body('batches.*.purchasePrice').isFloat({ min: 0 }).withMessage('Purchase price is required'),
];

export async function createOpeningStockEntry(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!._id.toString();
    const result = await openingStockService.createOpeningStockEntry({
      ...req.body,
      createdBy: userId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listOpeningStockEntries(
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
    const data = await openingStockService.listOpeningStockEntries(companyId, financialYearId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getNextOpeningStockEntryNo(
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
    const entryNo = await openingStockService.getNextOpeningStockEntryNo(companyId, financialYearId);
    res.json({ success: true, data: { entryNo } });
  } catch (err) {
    next(err);
  }
}

export async function getOpeningStockEntryById(
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
    const data = await openingStockService.getOpeningStockEntryById(id, companyId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Opening purchase entry not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateOpeningStockEntry(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id;
    const companyId = (req.query.companyId as string) || req.body.companyId;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const userId = req.user!._id.toString();
    const result = await openingStockService.updateOpeningStockEntry(id, companyId, {
      ...req.body,
      createdBy: userId,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function deleteOpeningStockEntry(
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
    const deleted = await openingStockService.deleteOpeningStockEntry(id, companyId);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Opening purchase entry not found' });
      return;
    }
    res.json({ success: true, message: 'Opening purchase entry deleted' });
  } catch (err) {
    next(err);
  }
}

// Aliases for Opening Purchase naming convention
export const postOpeningPurchaseValidators = postOpeningStockValidators;
export const postOpeningPurchase = postOpeningStock;
export const importOpeningPurchaseValidators = importOpeningStockValidators;
export const importOpeningPurchase = importOpeningStock;
export const createOpeningPurchaseEntryValidators = createOpeningStockEntryValidators;
export const createOpeningPurchaseEntry = createOpeningStockEntry;
export const listOpeningPurchaseEntries = listOpeningStockEntries;
export const getNextOpeningPurchaseEntryNo = getNextOpeningStockEntryNo;
export const getOpeningPurchaseEntryById = getOpeningStockEntryById;
export const updateOpeningPurchaseEntry = updateOpeningStockEntry;
export const deleteOpeningPurchaseEntry = deleteOpeningStockEntry;

