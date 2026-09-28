import { Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { AuthRequest } from '../middlewares/auth';
import * as voucherService from '../services/voucherService';
import { validate } from '../middlewares/validate';

export async function list(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const voucherType = req.query.voucherType as string | undefined;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'companyId and financialYearId required' });
      return;
    }
    const data = await voucherService.list(companyId, financialYearId, {
      voucherType,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      page,
      limit,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export const createValidators = [
  body('companyId').notEmpty().withMessage('Company ID required'),
  body('financialYearId').notEmpty().withMessage('Financial year ID required'),
  body('voucherType').isIn(['Receipt', 'Payment', 'Journal', 'Contra', 'ChequePayment', 'ChequeReceipt', 'Sales', 'Purchase', 'Opening']).withMessage('Valid voucher type required'),
  body('date').isISO8601().withMessage('Valid date required'),
  body('lines').isArray({ min: 2 }).withMessage('At least 2 lines required'),
  body('lines.*.ledgerAccountId').notEmpty().withMessage('Ledger account required'),
  body('lines.*.debitAmount').isFloat({ min: 0 }).withMessage('Debit must be non-negative'),
  body('lines.*.creditAmount').isFloat({ min: 0 }).withMessage('Credit must be non-negative'),
  body('narration').optional().trim(),
];

export async function create(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!._id.toString();
    const input = {
      ...req.body,
      date: new Date(req.body.date),
      createdBy: userId,
    };
    const data = await voucherService.createAndPost(input);
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getNextVoucherNo(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const voucherType = (req.query.voucherType as string) || 'Receipt';
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'companyId and financialYearId required' });
      return;
    }
    const voucherNo = await voucherService.getNextVoucherNo(companyId, financialYearId, voucherType);
    res.json({ success: true, data: { voucherNo } });
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
    const voucher = await voucherService.getById(id);
    if (!voucher) {
      res.status(404).json({ success: false, message: 'Voucher not found' });
      return;
    }
    res.json({ success: true, data: voucher });
  } catch (err) {
    next(err);
  }
}

export async function deleteVoucher(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id;
    await voucherService.deleteVoucher(id);
    res.json({ success: true, message: 'Voucher deleted successfully' });
  } catch (err) {
    next(err);
  }
}

