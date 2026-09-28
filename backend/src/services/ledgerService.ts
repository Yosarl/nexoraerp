import mongoose from 'mongoose';
import { LedgerEntry } from '../models/LedgerEntry';
import { LedgerAccount } from '../models/LedgerAccount';
import { Voucher } from '../models/Voucher';
import { AppError } from '../middlewares/errorHandler';

import { SalesInvoice } from '../models/SalesInvoice';
import { PurchaseInvoice } from '../models/PurchaseInvoice';
import { BillReference } from '../models/BillReference';

export interface LedgerLine {
  ledgerAccountId: string;
  debitAmount: number;
  creditAmount: number;
  narration?: string;
}

export async function postVoucherLines(
  companyId: string,
  financialYearId: string,
  date: Date,
  lines: LedgerLine[],
  voucherId: string,
  referenceType?: string,
  referenceId?: string,
  userId?: string,
  referenceNo?: string
): Promise<void> {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    totalDebit += line.debitAmount;
    totalCredit += line.creditAmount;
  }
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new AppError('Voucher is not balanced: total debits must equal total credits', 400);
  }

  const entries = lines.map((line) => ({
    companyId: new mongoose.Types.ObjectId(companyId),
    financialYearId: new mongoose.Types.ObjectId(financialYearId),
    date,
    voucherId: new mongoose.Types.ObjectId(voucherId),
    referenceType,
    referenceId: referenceId ? new mongoose.Types.ObjectId(referenceId) : undefined,
    referenceNo,
    ledgerAccountId: new mongoose.Types.ObjectId(line.ledgerAccountId),
    debitAmount: line.debitAmount,
    creditAmount: line.creditAmount,
    narration: line.narration,
    createdBy: userId ? new mongoose.Types.ObjectId(userId) : undefined,
  }));

  await LedgerEntry.insertMany(entries);
}

export interface LedgerTransactionItem {
  date: Date;
  voucherNo?: string;
  entryName: string;
  particulars: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  balanceIsDebit: boolean;
  narration?: string;
  isInvoice?: boolean;
  settlements?: Array<{ billNumber: string; amount: number }>;
  chequeStatus?: 'PENDING' | 'CLEARED' | 'BOUNCED';
  bankDate?: Date;
  isReconciled?: boolean;
  chequeNumber?: string;
  chequeDate?: Date;
}

export function isSystemGeneratedNarration(
  text?: string,
  context?: {
    voucherType?: string;
    invoiceNo?: string;
    voucherNo?: string;
  }
): boolean {
  if (!text) return true;
  const t = text.trim();
  if (!t || t === '-') return true;

  // 1. Sales & POS patterns (e.g. B2C-..., POS ..., B2C Sale ..., B2C ... - Sale, etc.)
  if (/^(B2C|POS)(\s+Sale)?(\s+.*)?$/i.test(t)) return true;
  if (/^Sales(\s+Return)?(\s+.*)?$/i.test(t)) return true;

  // 2. Purchase patterns (e.g. Purchase ..., Purchase Return ...)
  if (/^Purchase(\s+Return)?(\s+.*)?$/i.test(t)) return true;

  // 3. Voucher system patterns (e.g. Payment to ..., Receipt from ..., Payment via ..., Payment against ...)
  if (/^(Payment|Receipt)\s+(to|from|via|against)\b/i.test(t)) return true;
  if (/^(Payment|Receipt|Journal|Contra|Sales|Purchase|Opening|ChequePayment|ChequeReceipt)\s+Voucher\b/i.test(t)) return true;

  // 4. Stock, inventory, opening, and rounding
  if (/^(Opening\s+(Stock|Balance)|Stock\s+Adjustment|Damage\s*\/?\s*Wastage)\b/i.test(t)) return true;
  if (/^(Rounding\s+Adjustment|Round(\s+Off)?)$/i.test(t)) return true;

  // 5. Code / invoice / voucher number patterns (e.g. B2C-000003, PV-00001, etc.)
  if (/^[A-Z]{1,5}-[0-9]{3,8}$/i.test(t)) return true;

  // 6. Match specific context numbers
  if (context?.invoiceNo) {
    const invLower = context.invoiceNo.toLowerCase();
    const tLower = t.toLowerCase();
    if (tLower === invLower || tLower === `b2c ${invLower}` || tLower === `pos ${invLower}` || tLower === `purchase ${invLower}`) {
      return true;
    }
  }
  if (context?.voucherNo && t.toLowerCase() === context.voucherNo.toLowerCase()) {
    return true;
  }

  return false;
}

export function cleanUserNarration(
  rawNarration?: string,
  context?: {
    voucherType?: string;
    invoiceNo?: string;
    voucherNo?: string;
  }
): string {
  if (!rawNarration) return '';
  const trimmed = rawNarration.trim();
  if (!trimmed) return '';

  if (isSystemGeneratedNarration(trimmed, context)) {
    return '';
  }

  return trimmed;
}

export async function getLedgerReport(
  companyId: string,
  financialYearId: string,
  ledgerAccountId: string,
  fromDate: Date,
  toDate: Date
): Promise<{
  openingBalance: number;
  openingIsDebit: boolean;
  transactions: LedgerTransactionItem[];
  closingBalance: number;
  closingIsDebit: boolean;
  totalDebit: number;
  totalCredit: number;
  totalPendingAmount?: number;
  totalBouncedAmount?: number;
  reconciledBalance?: number;
  reconciledIsDebit?: boolean;
}> {
  const account = await LedgerAccount.findById(ledgerAccountId);
  if (!account) throw new AppError('Ledger account not found', 404);

  const ob = account.openingBalances.find(
    (b) => b.financialYearId.toString() === financialYearId
  );
  let openingBalance = ob ? ob.amount : 0;
  let openingIsDebit = ob ? ob.isDebit : true;

  // 1. Calculate opening balance as of fromDate (Initial Opening Balance + All transactions prior to fromDate)
  const priorEntries = await LedgerEntry.find({
    companyId: new mongoose.Types.ObjectId(companyId),
    financialYearId: new mongoose.Types.ObjectId(financialYearId),
    ledgerAccountId: new mongoose.Types.ObjectId(ledgerAccountId),
    date: { $lt: fromDate },
  })
    .populate({
      path: 'voucherId',
      select: 'voucherType chequeStatus isReconciled chequeNumber',
    })
    .lean();

  let priorNet = openingIsDebit ? openingBalance : -openingBalance;

  for (const pe of priorEntries) {
    const v = pe.voucherId as any;
    const vType = v?.voucherType;
    const isExplicitChequeVoucher = vType === 'ChequePayment' || vType === 'ChequeReceipt';
    const hasChequeNumber = Boolean(v?.chequeNumber && v.chequeNumber.trim() !== '' && v.chequeNumber !== '-');
    const isBouncedOrCleared = v?.chequeStatus === 'BOUNCED' || v?.chequeStatus === 'CLEARED';
    const isCheque = isExplicitChequeVoucher || hasChequeNumber || isBouncedOrCleared;

    let chqStatus: 'PENDING' | 'CLEARED' | 'BOUNCED' | undefined = undefined;
    if (isCheque) {
      if (v?.chequeStatus === 'BOUNCED') {
        chqStatus = 'BOUNCED';
      } else if (v?.chequeStatus === 'CLEARED' || v?.isReconciled) {
        chqStatus = 'CLEARED';
      } else {
        chqStatus = 'PENDING';
      }
    }

    const isPendingCheque = chqStatus === 'PENDING';
    const isBouncedCheque = chqStatus === 'BOUNCED';
    const isExcludedFromBalance = isPendingCheque || isBouncedCheque;

    if (!isExcludedFromBalance) {
      priorNet += (pe.debitAmount || 0) - (pe.creditAmount || 0);
    }
  }

  const effectiveOpeningBalance = Math.abs(priorNet);
  const effectiveOpeningIsDebit = priorNet >= 0;

  // 2. Query entries within selected date range
  const entries = await LedgerEntry.find({
    companyId,
    financialYearId,
    ledgerAccountId,
    date: { $gte: fromDate, $lte: toDate },
  })
    .sort({ date: 1, createdAt: 1 })
    .populate({
      path: 'voucherId',
      select: 'voucherNo voucherType narration referenceType referenceId referenceNo lines chequeNumber chequeDate chequeStatus bankDate isReconciled',
      populate: {
        path: 'lines.ledgerAccountId',
        select: 'name code',
      },
    })
    .lean();

  // Batch lookup referenced sales and purchase invoices
  const salesInvoiceIds: mongoose.Types.ObjectId[] = [];
  const purchaseInvoiceIds: mongoose.Types.ObjectId[] = [];
  const voucherIds: mongoose.Types.ObjectId[] = [];

  for (const e of entries) {
    const v = e.voucherId as any;
    if (v?._id) voucherIds.push(v._id);
    const refType = e.referenceType || v?.referenceType;
    const refId = e.referenceId || v?.referenceId;
    if (refType === 'SalesInvoice' && refId) salesInvoiceIds.push(refId);
    if (refType === 'PurchaseInvoice' && refId) purchaseInvoiceIds.push(refId);
  }

  const salesInvoices = salesInvoiceIds.length > 0
    ? await SalesInvoice.find({ _id: { $in: salesInvoiceIds } }, 'invoiceNo type narration').lean()
    : [];
  const salesInvMap = new Map(salesInvoices.map((s: any) => [s._id.toString(), s]));

  const purchaseInvoices = purchaseInvoiceIds.length > 0
    ? await PurchaseInvoice.find({ _id: { $in: purchaseInvoiceIds } }, 'invoiceNo supplierInvoiceNo narration').lean()
    : [];
  const purchaseInvMap = new Map(purchaseInvoices.map((p: any) => [p._id.toString(), p]));

  // Batch lookup Against Reference bill settlements for vouchers
  const agstRefs = voucherIds.length > 0
    ? await BillReference.find({
        companyId,
        ledgerAccountId: new mongoose.Types.ObjectId(ledgerAccountId),
        referenceType: 'Voucher',
        referenceId: { $in: voucherIds },
        refType: 'Agst Ref',
      }).lean()
    : [];

  // Map voucherId -> array of settled billNumbers and full settlement amounts
  const voucherAgstRefMap = new Map<string, string[]>();
  const voucherSettlementsMap = new Map<string, Array<{ billNumber: string; amount: number }>>();
  for (const ref of agstRefs) {
    const vId = ref.referenceId.toString();
    const list = voucherAgstRefMap.get(vId) || [];
    if (ref.billNumber && !list.includes(ref.billNumber)) {
      list.push(ref.billNumber);
    }
    voucherAgstRefMap.set(vId, list);

    const sList = voucherSettlementsMap.get(vId) || [];
    sList.push({ billNumber: ref.billNumber, amount: ref.amount });
    voucherSettlementsMap.set(vId, sList);
  }

  let runningBalance = priorNet;

  let totalPendingAmount = 0;
  let totalBouncedAmount = 0;

  const transactions: LedgerTransactionItem[] = [];

  for (const e of entries) {
    const v = e.voucherId as any;
    const vType = v?.voucherType;
    const isExplicitChequeVoucher = vType === 'ChequePayment' || vType === 'ChequeReceipt';
    const hasChequeNumber = Boolean(v?.chequeNumber && v.chequeNumber.trim() !== '' && v.chequeNumber !== '-');
    const isBouncedOrCleared = v?.chequeStatus === 'BOUNCED' || v?.chequeStatus === 'CLEARED';
    const isCheque = isExplicitChequeVoucher || hasChequeNumber || isBouncedOrCleared;

    let chequeStatus: 'PENDING' | 'CLEARED' | 'BOUNCED' | undefined = undefined;
    if (isCheque) {
      if (v?.chequeStatus === 'BOUNCED') {
        chequeStatus = 'BOUNCED';
      } else if (v?.chequeStatus === 'CLEARED' || v?.isReconciled) {
        chequeStatus = 'CLEARED';
      } else {
        chequeStatus = 'PENDING';
      }
    }

    const isPendingCheque = chequeStatus === 'PENDING';
    const isBouncedCheque = chequeStatus === 'BOUNCED';
    const isExcludedFromBalance = isPendingCheque || isBouncedCheque;

    const debit = e.debitAmount || 0;
    const credit = e.creditAmount || 0;

    // Do NOT reduce or add pending or bounced cheques into the running balance
    if (!isExcludedFromBalance) {
      runningBalance += debit - credit;
    }
    const balanceIsDebit = runningBalance >= 0;

    if (isPendingCheque) {
      totalPendingAmount += (debit || credit || 0);
    }
    if (isBouncedCheque) {
      totalBouncedAmount += (debit || credit || 0);
    }

    const refType = e.referenceType || v?.referenceType;
    const refIdStr = (e.referenceId || v?.referenceId)?.toString();
    const salesInv = refType === 'SalesInvoice' && refIdStr ? salesInvMap.get(refIdStr) : undefined;
    const purchaseInv = refType === 'PurchaseInvoice' && refIdStr ? purchaseInvMap.get(refIdStr) : undefined;

    // Detect invoice / reference number
    let invoiceNo = e.referenceNo || v?.referenceNo || '';
    if (!invoiceNo && salesInv) {
      invoiceNo = salesInv.invoiceNo;
    }
    if (!invoiceNo && purchaseInv) {
      invoiceNo = purchaseInv.invoiceNo;
    }
    if (!invoiceNo) {
      const textToSearch = `${e.narration || ''} ${v?.narration || ''}`;
      const match = textToSearch.match(/(B2C-\d+|INV-\d+|PUR-\d+|PURV-\d+)/i);
      if (match) {
        invoiceNo = match[1];
      }
    }

    // Determine Entry Name
    let entryName = '';
    const isB2CSale =
      salesInv?.type === 'B2C' ||
      invoiceNo.startsWith('B2C-') ||
      (e.narration || '').includes('B2C') ||
      (v?.narration || '').includes('B2C');
    const isPOSSale =
      salesInv?.type === 'POS' ||
      invoiceNo.startsWith('INV-') ||
      (e.narration || '').includes('POS') ||
      (v?.narration || '').includes('POS');

    if (vType === 'Sales' || isB2CSale || isPOSSale) {
      if (isB2CSale) {
        entryName = 'Sales B2C';
      } else if (isPOSSale) {
        entryName = 'Sales POS';
      } else {
        entryName = 'Sales';
      }
    } else if (vType === 'Purchase' || purchaseInv || invoiceNo.startsWith('PUR')) {
      entryName = 'Purchase';
    } else if (vType === 'Receipt' || vType === 'ChequeReceipt') {
      entryName = 'Receipt Voucher';
    } else if (vType === 'Payment' || vType === 'ChequePayment') {
      entryName = 'Payment Voucher';
    } else if (vType === 'Contra') {
      entryName = 'Contra Voucher';
    } else if (vType === 'Journal') {
      entryName = 'Journal Voucher';
    } else if (vType === 'Opening') {
      entryName = 'Opening Balance';
    } else {
      entryName = vType || 'Journal Voucher';
    }

    // Determine Voucher column value (Sales B2C number for B2C sales)
    let voucherColumnVal = v?.voucherNo || '';
    if (isB2CSale && invoiceNo) {
      voucherColumnVal = invoiceNo;
    } else if ((isPOSSale || vType === 'Sales') && invoiceNo) {
      voucherColumnVal = invoiceNo;
    } else if (vType === 'Purchase' && invoiceNo) {
      voucherColumnVal = invoiceNo;
    }

    // Determine Reference column value (ONLY show referred voucher number when using on ref, otherwise '-')
    let referenceVal = '-';
    const isPrimaryInvoice = vType === 'Sales' || vType === 'Purchase' || isB2CSale || isPOSSale;

    if (!isPrimaryInvoice) {
      const vIdStr = v?._id?.toString();
      const agstBills = vIdStr ? voucherAgstRefMap.get(vIdStr) : undefined;

      if (agstBills && agstBills.length > 0) {
        referenceVal = agstBills.join(', ');
      } else if (salesInv?.invoiceNo) {
        referenceVal = salesInv.invoiceNo;
      } else if (purchaseInv?.invoiceNo) {
        referenceVal = purchaseInv.invoiceNo;
      } else if (
        v?.referenceNo &&
        v.referenceNo !== v?.voucherNo &&
        v.referenceNo !== voucherColumnVal
      ) {
        referenceVal = v.referenceNo;
      } else if (
        e.referenceNo &&
        e.referenceNo !== v?.voucherNo &&
        e.referenceNo !== voucherColumnVal
      ) {
        referenceVal = e.referenceNo;
      }
    }

    // Determine Particulars (opposing account in the transaction)
    let particulars = '';
    if (v && Array.isArray(v.lines) && v.lines.length > 0) {
      const isDr = debit > 0;
      if (isDr) {
        // Current entry is Debit. Look for opposing Credit lines (excluding current account)
        const opposingCreditLines = v.lines.filter((l: any) => {
          const lineAccId = (l.ledgerAccountId?._id || l.ledgerAccountId)?.toString();
          return lineAccId !== ledgerAccountId && (l.creditAmount || 0) > 0;
        });

        if (opposingCreditLines.length === 1) {
          particulars = opposingCreditLines[0].ledgerAccountId?.name || 'SALES ACCOUNT';
        } else if (opposingCreditLines.length > 1) {
          const nonTaxLines = opposingCreditLines.filter((l: any) => {
            const name = (l.ledgerAccountId?.name || '').toLowerCase();
            return !name.includes('vat') && !name.includes('tax') && !name.includes('round');
          });
          const candidates = nonTaxLines.length > 0 ? nonTaxLines : opposingCreditLines;
          candidates.sort((a: any, b: any) => (b.creditAmount || 0) - (a.creditAmount || 0));
          particulars = candidates[0].ledgerAccountId?.name || 'SALES ACCOUNT';
        }
      } else {
        // Current entry is Credit (e.g. received cash from customer).
        // Look for opposing Debit lines (excluding current account)
        let opposingDebitLines = v.lines.filter((l: any) => {
          const lineAccId = (l.ledgerAccountId?._id || l.ledgerAccountId)?.toString();
          return lineAccId !== ledgerAccountId && (l.debitAmount || 0) > 0;
        });

        // If matching narration exists (e.g. "Cash Payment", "Card Payment"), pick that line
        if (e.narration && opposingDebitLines.length > 1) {
          const matchLines = opposingDebitLines.filter((l: any) => l.narration === e.narration);
          if (matchLines.length > 0) {
            opposingDebitLines = matchLines;
          }
        }

        if (opposingDebitLines.length === 1) {
          particulars = opposingDebitLines[0].ledgerAccountId?.name || 'CASH IN HAND';
        } else if (opposingDebitLines.length > 1) {
          const nonTaxLines = opposingDebitLines.filter((l: any) => {
            const name = (l.ledgerAccountId?.name || '').toLowerCase();
            return !name.includes('vat') && !name.includes('tax') && !name.includes('round');
          });
          const candidates = nonTaxLines.length > 0 ? nonTaxLines : opposingDebitLines;
          candidates.sort((a: any, b: any) => (b.debitAmount || 0) - (a.debitAmount || 0));
          particulars = candidates[0].ledgerAccountId?.name || 'CASH IN HAND';
        }
      }
    }

    if (!particulars) {
      particulars = debit > 0 ? 'SALES ACCOUNT' : 'CASH IN HAND';
    }

    // Extract user-typed narration only
    let userNarration = '';
    const isSales = salesInv || refType === 'SalesInvoice' || isB2CSale || isPOSSale || vType === 'Sales';
    const isPurchase = purchaseInv || refType === 'PurchaseInvoice' || vType === 'Purchase';

    if (isSales) {
      if (salesInv?.narration) {
        userNarration = cleanUserNarration(salesInv.narration, { invoiceNo, voucherNo: v?.voucherNo });
      }
      // Never fall back to e.narration or v.narration for sales, as those are auto-generated strings
    } else if (isPurchase) {
      if (purchaseInv?.narration) {
        userNarration = cleanUserNarration(purchaseInv.narration, { invoiceNo, voucherNo: v?.voucherNo });
      }
      // Never fall back to e.narration or v.narration for purchase, as those are auto-generated strings
    } else {
      // Vouchers (Payment, Receipt, Journal, etc.)
      if (e.narration) {
        userNarration = cleanUserNarration(e.narration, { invoiceNo, voucherNo: v?.voucherNo });
      }
      // If current line has no user narration (e.g. Cash/Bank line in a payment/receipt voucher),
      // look at opposing lines in the same voucher
      if (!userNarration && v && Array.isArray(v.lines)) {
        for (const line of v.lines) {
          const lId = (line.ledgerAccountId?._id || line.ledgerAccountId)?.toString();
          if (lId !== ledgerAccountId && line.narration) {
            const clean = cleanUserNarration(line.narration, { invoiceNo, voucherNo: v?.voucherNo });
            if (clean) {
              userNarration = clean;
              break;
            }
          }
        }
      }
      // Finally check voucher header narration
      if (!userNarration && v?.narration) {
        userNarration = cleanUserNarration(v.narration, { invoiceNo, voucherNo: v?.voucherNo });
      }
    }

    const vIdStr = v?._id?.toString();
    const settlements = vIdStr ? voucherSettlementsMap.get(vIdStr) : undefined;

    transactions.push({
      date: e.date,
      voucherNo: voucherColumnVal,
      entryName,
      particulars,
      reference: referenceVal,
      debit,
      credit,
      balance: Math.abs(runningBalance),
      balanceIsDebit,
      narration: userNarration || '',
      isInvoice: isPrimaryInvoice,
      settlements: settlements && settlements.length > 0 ? settlements : undefined,
      chequeStatus,
      bankDate: v?.bankDate,
      isReconciled: v?.isReconciled ?? false,
      chequeNumber: v?.chequeNumber,
      chequeDate: v?.chequeDate,
    });
  }

  const totalDebit = entries.reduce((s, e) => s + (e.debitAmount || 0), 0);
  const totalCredit = entries.reduce((s, e) => s + (e.creditAmount || 0), 0);
  const closingBalance = Math.abs(runningBalance);
  const closingIsDebit = runningBalance >= 0;

  return {
    openingBalance: effectiveOpeningBalance,
    openingIsDebit: effectiveOpeningIsDebit,
    transactions,
    closingBalance,
    closingIsDebit,
    totalDebit,
    totalCredit,
    totalPendingAmount,
    totalBouncedAmount,
    reconciledBalance: closingBalance,
    reconciledIsDebit: closingIsDebit,
  };
}

export async function getEntriesByVoucherId(voucherId: string): Promise<Array<{
  ledgerAccountId: string;
  ledgerAccountName: string;
  ledgerAccountCode: string;
  debitAmount: number;
  creditAmount: number;
  narration?: string;
}>> {
  const entries = await LedgerEntry.find({ voucherId: new mongoose.Types.ObjectId(voucherId) })
    .populate('ledgerAccountId', 'name code')
    .sort({ createdAt: 1 })
    .lean();
  return entries.map((e: any) => ({
    ledgerAccountId: e.ledgerAccountId?._id?.toString() ?? e.ledgerAccountId?.toString(),
    ledgerAccountName: e.ledgerAccountId?.name ?? '',
    ledgerAccountCode: e.ledgerAccountId?.code ?? '',
    debitAmount: e.debitAmount ?? 0,
    creditAmount: e.creditAmount ?? 0,
    narration: e.narration,
  }));
}

export async function getTrialBalance(
  companyId: string,
  financialYearId: string,
  asAtDate: Date
): Promise<Array<{ ledgerAccountId: string; name: string; code: string; debit: number; credit: number }>> {
  const accounts = await LedgerAccount.find({ companyId }).populate('groupId', 'name code type').lean();
  const entries = await LedgerEntry.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        financialYearId: new mongoose.Types.ObjectId(financialYearId),
        date: { $lte: asAtDate },
      },
    },
    {
      $group: {
        _id: '$ledgerAccountId',
        debit: { $sum: '$debitAmount' },
        credit: { $sum: '$creditAmount' },
      },
    },
  ]);

  const entryMap = new Map(
    entries.map((e) => [e._id.toString(), { debit: e.debit, credit: e.credit }])
  );

  const result: Array<{ ledgerAccountId: string; name: string; code: string; debit: number; credit: number }> = [];
  for (const acc of accounts) {
    const id = acc._id.toString();
    const ob = (acc.openingBalances || []).find(
      (b: { financialYearId: { toString: () => string } }) => b.financialYearId.toString() === financialYearId
    );
    let debit = ob && ob.isDebit ? ob.amount : 0;
    let credit = ob && !ob.isDebit ? ob.amount : 0;
    const e = entryMap.get(id);
    if (e) {
      debit += e.debit;
      credit += e.credit;
    }
    const balance = debit - credit;
    if (Math.abs(balance) < 0.01) continue;
    result.push({
      ledgerAccountId: id,
      name: acc.name,
      code: acc.code,
      debit: balance > 0 ? balance : 0,
      credit: balance < 0 ? -balance : 0,
    });
  }

  return result;
}

export async function getProfitLoss(
  companyId: string,
  financialYearId: string,
  fromDate: Date,
  toDate: Date
): Promise<{ income: number; expenses: number; netProfit: number; groups: Array<{ type: string; name: string; amount: number }> }> {
  const tb = await getTrialBalance(companyId, financialYearId, toDate);
  const accounts = await LedgerAccount.find({ companyId }).populate('groupId', 'name code type').lean();
  const accMap = new Map(accounts.map((a) => [a._id.toString(), a]));
  const tbMap = new Map(tb.map((r) => [r.ledgerAccountId, { debit: r.debit, credit: r.credit }]));
  let income = 0;
  let expenses = 0;
  const groups: Array<{ type: string; name: string; amount: number }> = [];
  for (const acc of accounts) {
    const g = acc.groupId as { type?: string; name?: string } | null;
    const type = (g?.type ?? 'Other').toUpperCase();
    const t = tbMap.get(acc._id.toString());
    const debit = t?.debit ?? 0;
    const credit = t?.credit ?? 0;
    const net = credit - debit;
    if (type === 'INCOME') {
      income += net;
      if (Math.abs(net) > 0.01) groups.push({ type: 'Income', name: acc.name, amount: net });
    } else if (type === 'EXPENSE') {
      const expAmt = debit - credit;
      expenses += expAmt;
      if (Math.abs(expAmt) > 0.01) groups.push({ type: 'Expense', name: acc.name, amount: expAmt });
    }
  }
  return { income, expenses, netProfit: income - expenses, groups };
}

export async function getBalanceSheet(
  companyId: string,
  financialYearId: string,
  asAtDate: Date
): Promise<{ assets: number; liabilities: number; equity: number; balanced: boolean; groups: Array<{ type: string; name: string; amount: number }> }> {
  const tb = await getTrialBalance(companyId, financialYearId, asAtDate);
  const accounts = await LedgerAccount.find({ companyId }).populate('groupId', 'name code type').lean();
  const tbMap = new Map(tb.map((r) => [r.ledgerAccountId, { debit: r.debit, credit: r.credit }]));
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  const groups: Array<{ type: string; name: string; amount: number }> = [];
  for (const acc of accounts) {
    const g = acc.groupId as { type?: string; name?: string } | null;
    const type = (g?.type ?? 'Other').toUpperCase();
    const t = tbMap.get(acc._id.toString());
    const debit = t?.debit ?? 0;
    const credit = t?.credit ?? 0;
    if (type === 'ASSET') {
      const amt = debit - credit;
      assets += amt;
      if (Math.abs(amt) > 0.01) groups.push({ type: 'Asset', name: acc.name, amount: amt });
    } else if (type === 'LIABILITY') {
      const amt = credit - debit;
      liabilities += amt;
      if (Math.abs(amt) > 0.01) groups.push({ type: 'Liability', name: acc.name, amount: amt });
    } else if (type === 'EQUITY') {
      const amt = credit - debit;
      equity += amt;
      if (Math.abs(amt) > 0.01) groups.push({ type: 'Equity', name: acc.name, amount: amt });
    } else if (type === 'DUTIES AND TAXES') {
      const groupName = (g as { name?: string })?.name?.toLowerCase() || '';
      if (groupName.includes('receivable') || debit > credit) {
        const amt = debit - credit;
        assets += amt;
        if (Math.abs(amt) > 0.01) groups.push({ type: 'Asset', name: acc.name, amount: amt });
      } else {
        const amt = credit - debit;
        liabilities += amt;
        if (Math.abs(amt) > 0.01) groups.push({ type: 'Liability', name: acc.name, amount: amt });
      }
    }
  }
  const balanced = Math.abs(assets - (liabilities + equity)) < 0.02;
  return { assets, liabilities, equity, balanced, groups };
}
