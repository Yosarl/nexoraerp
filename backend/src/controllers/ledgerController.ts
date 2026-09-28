import { Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { AuthRequest } from '../middlewares/auth';
import * as ledgerService from '../services/ledgerService';

export async function getEntriesByVoucher(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const voucherId = req.query.voucherId as string;
    if (!voucherId) {
      res.status(400).json({ success: false, message: 'voucherId required' });
      return;
    }
    const data = await ledgerService.getEntriesByVoucherId(voucherId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getLedgerReport(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const ledgerAccountId = req.query.ledgerAccountId as string;
    const fromDate = req.query.fromDate as string;
    const toDate = req.query.toDate as string;
    if (!companyId || !financialYearId || !ledgerAccountId || !fromDate || !toDate) {
      res.status(400).json({ success: false, message: 'companyId, financialYearId, ledgerAccountId, fromDate, toDate required' });
      return;
    }
    const fromDateObj = new Date(fromDate);
    fromDateObj.setHours(0, 0, 0, 0);
    const toDateObj = new Date(toDate);
    toDateObj.setHours(23, 59, 59, 999);

    const data = await ledgerService.getLedgerReport(
      companyId,
      financialYearId,
      ledgerAccountId,
      fromDateObj,
      toDateObj
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getTrialBalance(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const asAtDate = (req.query.asAtDate as string) || new Date().toISOString();
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'companyId and financialYearId required' });
      return;
    }
    const data = await ledgerService.getTrialBalance(companyId, financialYearId, new Date(asAtDate));
    const totalDebit = data.reduce((s, r) => s + r.debit, 0);
    const totalCredit = data.reduce((s, r) => s + r.credit, 0);
    res.json({ success: true, data: { rows: data, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 } });
  } catch (err) {
    next(err);
  }
}

export async function exportTrialBalance(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const asAtDate = (req.query.asAtDate as string) || new Date().toISOString().slice(0, 10);
    const format = (req.query.format as string) || 'xlsx';
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'companyId and financialYearId required' });
      return;
    }
    const data = await ledgerService.getTrialBalance(companyId, financialYearId, new Date(asAtDate));
    const totalDebit = data.reduce((s, r) => s + r.debit, 0);
    const totalCredit = data.reduce((s, r) => s + r.credit, 0);

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Trial Balance');
      sheet.columns = [
        { header: 'Code', key: 'code', width: 14 },
        { header: 'Name', key: 'name', width: 32 },
        { header: 'Debit (AED)', key: 'debit', width: 14 },
        { header: 'Credit (AED)', key: 'credit', width: 14 },
      ];
      data.forEach((r) => sheet.addRow({ code: r.code, name: r.name, debit: r.debit, credit: r.credit }));
      sheet.addRow({ code: '', name: 'Total', debit: totalDebit, credit: totalCredit });
      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=trial-balance-${asAtDate}.xlsx`);
      res.send(Buffer.from(buffer));
      return;
    }
    res.status(400).json({ success: false, message: 'format must be xlsx' });
  } catch (err) {
    next(err);
  }
}

export async function getProfitLoss(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const fromDate = (req.query.fromDate as string) || new Date().toISOString().slice(0, 10);
    const toDate = (req.query.toDate as string) || new Date().toISOString();
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'companyId and financialYearId required' });
      return;
    }
    const data = await ledgerService.getProfitLoss(companyId, financialYearId, new Date(fromDate), new Date(toDate));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getBalanceSheet(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const asAtDate = (req.query.asAtDate as string) || new Date().toISOString();
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'companyId and financialYearId required' });
      return;
    }
    const data = await ledgerService.getBalanceSheet(companyId, financialYearId, new Date(asAtDate));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
