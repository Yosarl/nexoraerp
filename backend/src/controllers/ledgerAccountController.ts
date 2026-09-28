import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middlewares/auth';
import * as ledgerAccountService from '../services/ledgerAccountService';
import { validate } from '../middlewares/validate';

export async function list(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const type = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await ledgerAccountService.listByCompany(companyId, { type, search });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getById(
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
    const data = await ledgerAccountService.getById(id, companyId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Ledger account not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export const createValidators = [
  body('companyId').notEmpty().withMessage('Company ID required'),
  body('name').trim().notEmpty().withMessage('Name required'),
  body('groupId').notEmpty().withMessage('Group required'),
  body('type').isIn(['Customer', 'Supplier', 'Bank', 'Cash', 'Expense', 'Revenue', 'Other']).withMessage('Valid type required'),
];

export async function create(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!._id.toString();
    const data = await ledgerAccountService.create({ ...req.body, createdBy: userId });
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export const updateValidators = [
  body('name').optional().trim().notEmpty(),
  body('phone').optional().trim(),
  body('email').optional().trim(),
  body('address').optional().trim(),
  body('TRN').optional().trim(),
  body('creditLimit').optional().isFloat({ min: 0 }),
  body('paymentTerms').optional().trim(),
  body('groupId').optional().notEmpty(),
  body('type').optional().isIn(['Customer', 'Supplier', 'Bank', 'Cash', 'Expense', 'Revenue', 'Other']),
];

export async function update(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id;
    const companyId = req.body.companyId || req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const userId = req.user!._id.toString();
    const data = await ledgerAccountService.update(id, companyId, req.body, userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function remove(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id;
    const companyId = req.body.companyId || (req.query.companyId as string);
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    await ledgerAccountService.remove(id, companyId);
    res.json({ success: true, message: 'Ledger account deleted' });
  } catch (err) {
    next(err);
  }
}
