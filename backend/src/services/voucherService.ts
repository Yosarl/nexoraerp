import mongoose from 'mongoose';
import { Voucher, IVoucher } from '../models/Voucher';
import { LedgerEntry } from '../models/LedgerEntry';
import { AppError } from '../middlewares/errorHandler';
import * as ledgerService from './ledgerService';

export interface CreateVoucherInput {
  companyId: string;
  financialYearId: string;
  voucherType: IVoucher['voucherType'];
  date: Date;
  narration?: string;
  lines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }>;
  chequeNumber?: string;
  chequeDate?: Date;
  bankLedgerId?: string;
  chequeStatus?: 'PENDING' | 'CLEARED' | 'BOUNCED';
  bankDate?: Date;
  isReconciled?: boolean;
  referenceType?: string;
  referenceId?: string;
  referenceNo?: string;
  createdBy?: string;
}

export async function getNextVoucherNo(
  companyId: string,
  financialYearId: string,
  voucherType: string
): Promise<string> {
  const prefix =
    voucherType === 'Receipt' ? 'RV' :
    voucherType === 'Payment' ? 'PV' :
    voucherType === 'Journal' ? 'JV' :
    voucherType === 'Contra' ? 'CV' :
    voucherType === 'Opening' ? 'OP' :
    voucherType === 'Sales' ? 'SV' :
    voucherType === 'Purchase' ? 'PURV' : 'CH';

  const regex = new RegExp(`^${prefix}-(\\d+)$`);
  const docs = await Voucher.find({
    companyId,
    financialYearId,
    voucherNo: regex,
  }).select('voucherNo').lean();

  let maxNum = 0;
  for (const doc of docs) {
    const m = doc.voucherNo.match(regex);
    if (m && m[1]) {
      const val = parseInt(m[1], 10);
      if (val > maxNum) maxNum = val;
    }
  }

  // If no prefix match, also check if legacy vouchers exist for this voucherType
  if (maxNum === 0) {
    const legacy = await Voucher.find({
      companyId,
      financialYearId,
      voucherType,
    }).select('voucherNo').lean();
    for (const doc of legacy) {
      const digits = doc.voucherNo.replace(/\D/g, '');
      const val = parseInt(digits, 10);
      if (!isNaN(val) && val > maxNum) maxNum = val;
    }
  }

  let nextNum = maxNum + 1;
  let candidate = `${prefix}-${nextNum.toString().padStart(5, '0')}`;
  while (await Voucher.exists({ companyId, financialYearId, voucherNo: candidate })) {
    nextNum++;
    candidate = `${prefix}-${nextNum.toString().padStart(5, '0')}`;
  }

  return candidate;
}

export async function createAndPost(
  input: CreateVoucherInput
): Promise<IVoucher> {
  const totalDebit = input.lines.reduce((s, l) => s + l.debitAmount, 0);
  const totalCredit = input.lines.reduce((s, l) => s + l.creditAmount, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new AppError('Voucher must be balanced', 400);
  }

  const voucherNo = await getNextVoucherNo(
    input.companyId,
    input.financialYearId,
    input.voucherType
  );

  const voucher = await Voucher.create({
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    voucherType: input.voucherType,
    voucherNo,
    date: input.date,
    narration: input.narration,
    lines: input.lines.map((l) => ({
      ledgerAccountId: l.ledgerAccountId,
      debitAmount: l.debitAmount,
      creditAmount: l.creditAmount,
      narration: l.narration,
    })),
    totalDebit,
    totalCredit,
    status: 'Posted',
    referenceType: input.referenceType,
    referenceId: input.referenceId ? new mongoose.Types.ObjectId(input.referenceId) : undefined,
    referenceNo: input.referenceNo,
    chequeNumber: input.chequeNumber,
    chequeDate: input.chequeDate,
    bankLedgerId: input.bankLedgerId,
    chequeStatus:
      input.chequeStatus ||
      (input.voucherType === 'ChequePayment' || input.voucherType === 'ChequeReceipt' || input.chequeNumber
        ? 'PENDING'
        : undefined),
    bankDate: input.bankDate,
    isReconciled: input.isReconciled ?? false,
    createdBy: input.createdBy,
  });

  await ledgerService.postVoucherLines(
    input.companyId,
    input.financialYearId,
    input.date,
    input.lines.map((l) => ({
      ledgerAccountId: l.ledgerAccountId,
      debitAmount: l.debitAmount,
      creditAmount: l.creditAmount,
      narration: l.narration,
    })),
    voucher._id.toString(),
    input.referenceType,
    input.referenceId,
    input.createdBy,
    input.referenceNo
  );

  return voucher.toObject();
}

export async function deleteVoucher(voucherId: string): Promise<void> {
  // Delete associated ledger entries
  await LedgerEntry.deleteMany({ voucherId });
  // Delete associated bill references if any
  try {
    const { deleteRefsBySource } = await import('./billReferenceService');
    await deleteRefsBySource('Voucher', voucherId);
  } catch (e) {
    // ignore if billReference module not available
  }
  // Delete the voucher itself
  await Voucher.deleteOne({ _id: voucherId });
}

export async function getById(voucherId: string): Promise<IVoucher | null> {
  return Voucher.findById(voucherId)
    .populate('lines.ledgerAccountId', 'name code type')
    .lean() as unknown as IVoucher | null;
}

export async function list(
  companyId: string,
  financialYearId: string,
  opts: { voucherType?: string; fromDate?: Date; toDate?: Date; page?: number; limit?: number } = {}
): Promise<{ vouchers: IVoucher[]; total: number }> {
  const filter: Record<string, unknown> = { companyId, financialYearId };
  if (opts.voucherType) {
    filter.voucherType = opts.voucherType;
    if (opts.voucherType === 'Receipt' || opts.voucherType === 'Payment' || opts.voucherType === 'Contra') {
      filter.referenceType = { $nin: ['SalesInvoice', 'PurchaseInvoice'] };
      filter.narration = { $not: /^(POS Sale|B2C Sale|Purchase )/i };
    }
  }
  if (opts.fromDate || opts.toDate) {
    filter.date = {};
    if (opts.fromDate) (filter.date as Record<string, Date>).$gte = opts.fromDate;
    if (opts.toDate) (filter.date as Record<string, Date>).$lte = opts.toDate;
  }
  const total = await Voucher.countDocuments(filter);
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const vouchers = await Voucher.find(filter)
    .populate('lines.ledgerAccountId', 'name code')
    .sort({ date: -1, voucherNo: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean() as unknown as IVoucher[];
  return { vouchers, total };
}
