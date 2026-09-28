import mongoose from 'mongoose';
import { LedgerEntry } from '../models/LedgerEntry';
import { LedgerAccount } from '../models/LedgerAccount';
import { Voucher } from '../models/Voucher';
import { AppError } from '../middlewares/errorHandler';

export interface BankReconciliationItem {
  voucherId: string;
  voucherNo: string;
  voucherType: string;
  bookDate: string;
  particulars: string;
  chequeNumber: string;
  chequeDate?: string;
  withdrawals: number;
  deposits: number;
  bankDate: string;
  chequeStatus: 'PENDING' | 'CLEARED' | 'BOUNCED';
  isReconciled: boolean;
  isBounced: boolean;
  narration?: string;
}

export interface BankReconciliationData {
  bankAccount: {
    _id: string;
    name: string;
    code: string;
  };
  fromDate: string;
  toDate: string;
  expectedBankBalance: number;
  expectedIsDebit: boolean;
  statementBalance: number;
  statementIsDebit: boolean;
  unreconciledAmount: number;
  unreconciledCount: number;
  reconciledCount: number;
  bouncedCount: number;
  pendingChequesCount?: number;
  items: BankReconciliationItem[];
}

export async function getBankReconciliationData(
  companyId: string,
  financialYearId: string,
  bankAccountId: string,
  fromDate: Date,
  toDate: Date,
  filterStatus: 'unreconciled' | 'reconciled' | 'bounced' | 'all' = 'unreconciled'
): Promise<BankReconciliationData> {
  const account = await LedgerAccount.findById(bankAccountId);
  if (!account) {
    throw new AppError('Bank account not found', 404);
  }

  const ob = account.openingBalances.find(
    (b) => b.financialYearId.toString() === financialYearId
  );
  const openingBalance = ob ? ob.amount : 0;
  const openingIsDebit = ob ? ob.isDebit : true;

  // 1. Get ALL entries up to toDate to calculate expected bank balance & statement balance
  const allEntriesUpToToDate = await LedgerEntry.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    financialYearId: new mongoose.Types.ObjectId(financialYearId),
    ledgerAccountId: new mongoose.Types.ObjectId(bankAccountId),
    date: { $lte: toDate },
  })
    .populate({
      path: 'voucherId',
      select: 'voucherNo voucherType chequeStatus bankDate isReconciled lines chequeNumber chequeDate narration',
    })
    .lean();

  let bookBalance = openingIsDebit ? openingBalance : -openingBalance;
  let clearedBalance = openingIsDebit ? openingBalance : -openingBalance;
  let totalUnmatchedAmount = 0;
  let totalUnreconciledCount = 0;
  let totalReconciledCount = 0;
  let totalBouncedCount = 0;
  let totalPendingChequesCount = 0;

  for (const e of allEntriesUpToToDate) {
    const debit = e.debitAmount || 0;
    const credit = e.creditAmount || 0;
    bookBalance += debit - credit;

    const v = e.voucherId as any;
    const vType = v?.voucherType;
    const isCheque = vType === 'ChequePayment' || vType === 'ChequeReceipt';
    let chqStatus = v?.chequeStatus;
    if (!chqStatus && isCheque) {
      chqStatus = 'PENDING';
    }

    const isReconciled = Boolean(v?.isReconciled || chqStatus === 'CLEARED');
    const isBounced = isCheque && chqStatus === 'BOUNCED';

    if (isReconciled && !isBounced) {
      clearedBalance += debit - credit;
      totalReconciledCount++;
    } else if (isBounced) {
      totalBouncedCount++;
    } else {
      totalUnreconciledCount++;
      totalUnmatchedAmount += debit + credit;
    }

    if (isCheque && !isReconciled) {
      totalPendingChequesCount++;
    }
  }

  // 2. Fetch entries within date range for the reconciliation grid
  const rangeEntries = await LedgerEntry.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    financialYearId: new mongoose.Types.ObjectId(financialYearId),
    ledgerAccountId: new mongoose.Types.ObjectId(bankAccountId),
    date: { $gte: fromDate, $lte: toDate },
  })
    .sort({ date: 1, createdAt: 1 })
    .populate({
      path: 'voucherId',
      select: 'voucherNo voucherType narration lines chequeNumber chequeDate chequeStatus bankDate isReconciled',
      populate: {
        path: 'lines.ledgerAccountId',
        select: 'name code',
      },
    })
    .lean();

  const items: BankReconciliationItem[] = [];

  for (const e of rangeEntries) {
    const v = e.voucherId as any;
    if (!v) continue;

    const vType = v.voucherType || '';
    const isCheque = vType === 'ChequePayment' || vType === 'ChequeReceipt';
    let chqStatus: 'PENDING' | 'CLEARED' | 'BOUNCED' = v.chequeStatus;
    if (!chqStatus && isCheque) {
      chqStatus = 'PENDING';
    } else if (!chqStatus) {
      chqStatus = v.isReconciled ? 'CLEARED' : 'PENDING';
    }

    const isReconciled = Boolean(v.isReconciled || chqStatus === 'CLEARED');
    const isBounced = isCheque && chqStatus === 'BOUNCED';

    // Apply status filter
    if (filterStatus === 'unreconciled' && (isReconciled || isBounced)) {
      continue;
    }
    if (filterStatus === 'reconciled' && (!isReconciled || isBounced)) {
      continue;
    }
    if (filterStatus === 'bounced') {
      // User requirement: In bounced check section only show pending cheques.
      // Don't show payment or received voucher there, only pending check payment or received only.
      if (!isCheque || isReconciled) {
        continue;
      }
    }

    // Determine particulars (opposing account)
    let particulars = '';
    if (Array.isArray(v.lines) && v.lines.length > 0) {
      const isBankDebit = (e.debitAmount || 0) > 0;
      const opposingLines = v.lines.filter((l: any) => {
        const lineId = (l.ledgerAccountId?._id || l.ledgerAccountId)?.toString();
        return lineId !== bankAccountId && (isBankDebit ? (l.creditAmount || 0) > 0 : (l.debitAmount || 0) > 0);
      });

      if (opposingLines.length > 0) {
        opposingLines.sort((a: any, b: any) =>
          isBankDebit ? (b.creditAmount || 0) - (a.creditAmount || 0) : (b.debitAmount || 0) - (a.debitAmount || 0)
        );
        particulars = opposingLines[0].ledgerAccountId?.name || '';
      }
    }
    if (!particulars) {
      particulars = v.narration || e.narration || (e.debitAmount > 0 ? 'Customer Deposit' : 'Payment');
    }

    const chequeNumber = v.chequeNumber || v.referenceNo || e.referenceNo || '-';
    const chequeDateStr = v.chequeDate ? new Date(v.chequeDate).toISOString().slice(0, 10) : undefined;
    const bankDateStr = v.bankDate ? new Date(v.bankDate).toISOString().slice(0, 10) : '';

    items.push({
      voucherId: v._id.toString(),
      voucherNo: v.voucherNo,
      voucherType: v.voucherType,
      bookDate: new Date(e.date).toISOString().slice(0, 10),
      particulars,
      chequeNumber,
      chequeDate: chequeDateStr,
      withdrawals: e.creditAmount || 0,
      deposits: e.debitAmount || 0,
      bankDate: bankDateStr,
      chequeStatus: chqStatus,
      isReconciled,
      isBounced,
      narration: v.narration || e.narration || '',
    });
  }

  return {
    bankAccount: {
      _id: account._id.toString(),
      name: account.name,
      code: account.code,
    },
    fromDate: fromDate.toISOString().slice(0, 10),
    toDate: toDate.toISOString().slice(0, 10),
    expectedBankBalance: Math.abs(bookBalance),
    expectedIsDebit: bookBalance >= 0,
    statementBalance: Math.abs(clearedBalance),
    statementIsDebit: clearedBalance >= 0,
    unreconciledAmount: totalUnmatchedAmount,
    unreconciledCount: totalUnreconciledCount,
    reconciledCount: totalReconciledCount,
    bouncedCount: totalBouncedCount,
    pendingChequesCount: totalPendingChequesCount,
    items,
  };
}

export interface SaveReconciliationItemInput {
  voucherId: string;
  bankDate?: string | null;
  isBounced?: boolean;
}

export async function saveBankReconciliation(
  companyId: string,
  financialYearId: string,
  bankAccountId: string,
  items: SaveReconciliationItemInput[]
): Promise<{ success: boolean; updatedCount: number }> {
  let updatedCount = 0;

  for (const item of items) {
    if (!item.voucherId) continue;

    const voucher = await Voucher.findOne({
      _id: new mongoose.Types.ObjectId(item.voucherId),
      companyId: new mongoose.Types.ObjectId(companyId),
    });

    if (!voucher) continue;

    const isCheque = voucher.voucherType === 'ChequePayment' || voucher.voucherType === 'ChequeReceipt';

    if (item.isBounced) {
      voucher.chequeStatus = 'BOUNCED';
      voucher.isReconciled = false;
      voucher.bankDate = undefined;
      voucher.reconciledAt = undefined;
    } else if (item.bankDate && item.bankDate.trim() !== '') {
      const parsedBankDate = new Date(item.bankDate);
      if (isCheque) {
        voucher.chequeStatus = 'CLEARED';
        // Per user requirement: PUT THAT DATE IN TO CHEQUE DATE AS THERE
        voucher.chequeDate = parsedBankDate;
      } else {
        voucher.chequeStatus = undefined;
      }
      voucher.bankDate = parsedBankDate;
      voucher.isReconciled = true;
      voucher.reconciledAt = new Date();
    } else {
      // Revert to pending
      voucher.chequeStatus = isCheque ? 'PENDING' : undefined;
      voucher.isReconciled = false;
      voucher.bankDate = undefined;
      voucher.reconciledAt = undefined;
    }

    await voucher.save();
    updatedCount++;
  }

  return { success: true, updatedCount };
}
