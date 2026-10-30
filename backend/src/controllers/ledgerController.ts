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
    const fromDateStr = req.query.fromDate as string | undefined;
    const toDateStr = req.query.toDate as string | undefined;
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'companyId and financialYearId required' });
      return;
    }

    let fromDate: Date | undefined;
    if (fromDateStr && fromDateStr.trim()) {
      fromDate = new Date(fromDateStr);
      fromDate.setHours(0, 0, 0, 0);
    }

    let toDate: Date | undefined;
    if (toDateStr && toDateStr.trim()) {
      toDate = new Date(toDateStr);
      toDate.setHours(23, 59, 59, 999);
    }

    const data = await ledgerService.getProfitLoss(companyId, financialYearId, fromDate, toDate);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function exportProfitLoss(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const fromDateStr = req.query.fromDate as string | undefined;
    const toDateStr = req.query.toDate as string | undefined;
    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'companyId and financialYearId required' });
      return;
    }

    let fromDate: Date | undefined;
    if (fromDateStr && fromDateStr.trim()) {
      fromDate = new Date(fromDateStr);
      fromDate.setHours(0, 0, 0, 0);
    }

    let toDate: Date | undefined;
    if (toDateStr && toDateStr.trim()) {
      toDate = new Date(toDateStr);
      toDate.setHours(23, 59, 59, 999);
    }

    const data = await ledgerService.getProfitLoss(companyId, financialYearId, fromDate, toDate);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Profit & Loss');

    sheet.columns = [
      { header: 'Particulars / Account', key: 'name', width: 44 },
      { header: 'Account Code', key: 'code', width: 16 },
      { header: 'Group / Category', key: 'category', width: 22 },
      { header: 'Debit (AED)', key: 'debit', width: 16 },
      { header: 'Credit (AED)', key: 'credit', width: 16 },
      { header: 'Amount (AED)', key: 'amount', width: 18 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };

    // 1. REVENUE / INCOME
    const incHeader = sheet.addRow({ name: 'REVENUE & INCOME', amount: data.income });
    incHeader.font = { bold: true, size: 12, color: { argb: 'FF065F46' } };
    incHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

    data.tree.income.forEach((group) => {
      const grpRow = sheet.addRow({
        name: `  ▸ ${group.groupName} [${group.category} Income]`,
        amount: group.totalAmount,
      });
      grpRow.font = { bold: true };
      grpRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

      group.accounts.forEach((acc) => {
        sheet.addRow({
          name: `      • ${acc.name}`,
          code: acc.code,
          category: group.groupName,
          debit: acc.debit || 0,
          credit: acc.credit || 0,
          amount: acc.amount,
        });
      });
    });

    const incTotalRow = sheet.addRow({ name: 'Total Revenue / Income', amount: data.income });
    incTotalRow.font = { bold: true };

    sheet.addRow({});

    // 2. EXPENSES
    const expHeader = sheet.addRow({ name: 'EXPENSES & PURCHASES', amount: data.expenses });
    expHeader.font = { bold: true, size: 12, color: { argb: 'FF991B1B' } };
    expHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

    data.tree.expenses.forEach((group) => {
      const grpRow = sheet.addRow({
        name: `  ▸ ${group.groupName} [${group.category} Expense]`,
        amount: group.totalAmount,
      });
      grpRow.font = { bold: true };
      grpRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

      group.accounts.forEach((acc) => {
        sheet.addRow({
          name: `      • ${acc.name}`,
          code: acc.code,
          category: group.groupName,
          debit: acc.debit || 0,
          credit: acc.credit || 0,
          amount: acc.amount,
        });
      });
    });

    const expTotalRow = sheet.addRow({ name: 'Total Expenses', amount: data.expenses });
    expTotalRow.font = { bold: true };

    sheet.addRow({});

    // 3. GROSS & NET PROFIT
    const grossRow = sheet.addRow({ name: 'Gross Profit (Direct Income - Direct Expense)', amount: data.grossProfit });
    grossRow.font = { bold: true };

    const netRow = sheet.addRow({
      name: data.netProfit >= 0 ? 'NET PROFIT' : 'NET LOSS',
      amount: data.netProfit,
    });
    netRow.font = { bold: true, size: 12, color: { argb: data.netProfit >= 0 ? 'FF065F46' : 'FF991B1B' } };
    netRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: data.netProfit >= 0 ? 'FFD1FAE5' : 'FFFEE2E2' },
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const asAtDate = toDateStr || new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=profit-loss-${asAtDate}.xlsx`);
    res.send(Buffer.from(buffer));
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

export async function getDayBook(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const voucherType = req.query.voucherType as string | undefined;
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'companyId and financialYearId required' });
      return;
    }

    const fromDateObj = fromDate ? new Date(fromDate) : new Date();
    fromDateObj.setHours(0, 0, 0, 0);

    const toDateObj = toDate ? new Date(toDate) : new Date();
    toDateObj.setHours(23, 59, 59, 999);

    const data = await ledgerService.getDayBook(companyId, financialYearId, {
      fromDate: fromDateObj,
      toDate: toDateObj,
      voucherType,
      search,
      page,
      limit,
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function exportDayBook(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const financialYearId = req.query.financialYearId as string;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const voucherType = req.query.voucherType as string | undefined;
    const search = req.query.search as string | undefined;

    if (!companyId || !financialYearId) {
      res.status(400).json({ success: false, message: 'companyId and financialYearId required' });
      return;
    }

    const fromDateObj = fromDate ? new Date(fromDate) : new Date();
    fromDateObj.setHours(0, 0, 0, 0);

    const toDateObj = toDate ? new Date(toDate) : new Date();
    toDateObj.setHours(23, 59, 59, 999);

    const result = await ledgerService.getDayBook(companyId, financialYearId, {
      fromDate: fromDateObj,
      toDate: toDateObj,
      voucherType,
      search,
      all: true,
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Day Book');

    sheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Voucher No', key: 'voucherNo', width: 16 },
      { header: 'Type', key: 'voucherType', width: 14 },
      { header: 'Reference', key: 'referenceNo', width: 16 },
      { header: 'Particulars / Account', key: 'particulars', width: 32 },
      { header: 'Debit (AED)', key: 'debit', width: 15 },
      { header: 'Credit (AED)', key: 'credit', width: 15 },
      { header: 'Narration', key: 'narration', width: 35 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E7FF' },
    };

    result.vouchers.forEach((v: any) => {
      const dateStr = v.date ? new Date(v.date).toISOString().slice(0, 10) : '';
      const particulars = v.lines?.map((l: any) => l.ledgerAccountId?.name || '').filter(Boolean).join(', ') || '-';
      sheet.addRow({
        date: dateStr,
        voucherNo: v.voucherNo || '',
        voucherType: v.voucherType || '',
        referenceNo: v.referenceNo || '',
        particulars,
        debit: v.totalDebit || 0,
        credit: v.totalCredit || 0,
        narration: v.narration || '',
      });
    });

    const totalRow = sheet.addRow({
      date: '',
      voucherNo: '',
      voucherType: '',
      referenceNo: '',
      particulars: 'Total',
      debit: result.summary.totalDebit,
      credit: result.summary.totalCredit,
      narration: '',
    });
    totalRow.font = { bold: true };

    const fromStr = fromDateObj.toISOString().slice(0, 10);
    const toStr = toDateObj.toISOString().slice(0, 10);
    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=day-book-${fromStr}_to_${toStr}.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
}

