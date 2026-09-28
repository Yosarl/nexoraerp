import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
import * as bankReconciliationService from '../services/bankReconciliationService';

export async function getReconciliation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const bankAccountId = req.query.bankAccountId as string;
    const fromDateStr = req.query.fromDate as string;
    const toDateStr = req.query.toDate as string;
    const filterStatus = (req.query.status as 'unreconciled' | 'reconciled' | 'bounced' | 'all') || 'unreconciled';

    if (!companyId || !financialYearId || !bankAccountId || !fromDateStr || !toDateStr) {
      res.status(400).json({
        success: false,
        message: 'companyId, financialYearId, bankAccountId, fromDate, and toDate are required',
      });
      return;
    }

    const fromDate = new Date(fromDateStr);
    const toDate = new Date(toDateStr);
    toDate.setHours(23, 59, 59, 999);

    const data = await bankReconciliationService.getBankReconciliationData(
      companyId,
      financialYearId,
      bankAccountId,
      fromDate,
      toDate,
      filterStatus
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function saveReconciliation(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { companyId, financialYearId, bankAccountId, items } = req.body;

    if (!companyId || !financialYearId || !bankAccountId || !Array.isArray(items)) {
      res.status(400).json({
        success: false,
        message: 'companyId, financialYearId, bankAccountId, and items array are required',
      });
      return;
    }

    const result = await bankReconciliationService.saveBankReconciliation(
      companyId,
      financialYearId,
      bankAccountId,
      items
    );

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
