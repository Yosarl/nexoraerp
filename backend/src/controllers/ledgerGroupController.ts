import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middlewares/auth';
import * as ledgerGroupService from '../services/ledgerGroupService';
import { validate } from '../middlewares/validate';

export async function list(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const search = req.query.search as string | undefined;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await ledgerGroupService.listByCompany(companyId, search);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function get(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await ledgerGroupService.getById(id, companyId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Group not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getNextCode(
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
    const code = await ledgerGroupService.getNextCode(companyId);
    res.json({ success: true, data: { code } });
  } catch (err) {
    next(err);
  }
}

export const createValidators = [
  body('companyId').notEmpty().withMessage('Company ID required'),
  body('name').trim().notEmpty().withMessage('Name required'),
  body('type').isIn(['Asset', 'Liability', 'Equity', 'Income', 'Expense', 'Duties and Taxes']).withMessage('Valid type required'),
  body('parentGroupId').optional().notEmpty(),
];

export async function create(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!._id.toString();
    const data = await ledgerGroupService.create({ ...req.body, createdBy: userId });
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export const updateValidators = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('type').optional().isIn(['Asset', 'Liability', 'Equity', 'Income', 'Expense', 'Duties and Taxes']).withMessage('Valid type required'),
  body('parentGroupId').optional(),
];

export async function update(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await ledgerGroupService.update(id, companyId, req.body);
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
    const { id } = req.params;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    await ledgerGroupService.remove(id, companyId);
    res.json({ success: true, message: 'Group deleted' });
  } catch (err) {
    next(err);
  }
}
