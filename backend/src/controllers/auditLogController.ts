import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middlewares/auth';
import * as auditLogService from '../services/auditLogService';

export async function list(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string | undefined;
    const userId = req.query.userId as string | undefined;
    const entityType = req.query.entityType as string | undefined;
    const form = req.query.form as string | undefined;
    const action = req.query.action as string | undefined;
    const entryNo = req.query.entryNo as string | undefined;
    const search = req.query.search as string | undefined;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const data = await auditLogService.list({
      companyId,
      userId,
      entityType,
      form,
      action,
      entryNo,
      search,
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
