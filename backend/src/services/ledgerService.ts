import mongoose from 'mongoose';
import { LedgerEntry } from '../models/LedgerEntry';
import { LedgerAccount } from '../models/LedgerAccount';
import { LedgerGroup } from '../models/LedgerGroup';
import { Voucher } from '../models/Voucher';
import { AppError } from '../middlewares/errorHandler';

import { SalesInvoice } from '../models/SalesInvoice';
import { PurchaseInvoice } from '../models/PurchaseInvoice';
import { BillReference } from '../models/BillReference';
import { FinancialYear } from '../models/FinancialYear';
import { OpeningPurchaseEntry } from '../models/OpeningPurchaseEntry';
import { getLiveStockValuation } from './stockService';
import { syncOpeningPurchaseVouchers } from './openingPurchaseService';
import { syncOpeningAccountsLedgerBalance } from './ledgerAccountService';

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
  voucherId?: string;
  voucherType?: string;
  referenceType?: string;
  referenceId?: string;
  referenceNo?: string;
  invoiceType?: string;
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

  const salesInvoices = (salesInvoiceIds.length > 0 || voucherIds.length > 0)
    ? await SalesInvoice.find(
        {
          $or: [
            ...(salesInvoiceIds.length > 0 ? [{ _id: { $in: salesInvoiceIds } }] : []),
            ...(voucherIds.length > 0 ? [{ voucherId: { $in: voucherIds } }] : []),
          ],
        },
        'invoiceNo type narration voucherId'
      ).lean()
    : [];
  const salesInvMap = new Map(salesInvoices.map((s: any) => [s._id.toString(), s]));
  const salesInvByVoucherMap = new Map(
    salesInvoices.filter((s: any) => s.voucherId).map((s: any) => [s.voucherId.toString(), s])
  );

  const purchaseInvoices = (purchaseInvoiceIds.length > 0 || voucherIds.length > 0)
    ? await PurchaseInvoice.find(
        {
          $or: [
            ...(purchaseInvoiceIds.length > 0 ? [{ _id: { $in: purchaseInvoiceIds } }] : []),
            ...(voucherIds.length > 0 ? [{ voucherId: { $in: voucherIds } }] : []),
          ],
        },
        'invoiceNo supplierInvoiceNo narration voucherId'
      ).lean()
    : [];
  const purchaseInvMap = new Map(purchaseInvoices.map((p: any) => [p._id.toString(), p]));
  const purchaseInvByVoucherMap = new Map(
    purchaseInvoices.filter((p: any) => p.voucherId).map((p: any) => [p.voucherId.toString(), p])
  );

  // Batch lookup Against Reference bill settlements for vouchers and sales/purchase invoices
  const allSalesInvoiceOids = salesInvoices.map((s: any) => s._id);
  const allPurchaseInvoiceOids = purchaseInvoices.map((p: any) => p._id);
  const agstRefsConditions: any[] = [];
  if (voucherIds.length > 0) {
    agstRefsConditions.push({ referenceType: 'Voucher', referenceId: { $in: voucherIds } });
  }
  if (allSalesInvoiceOids.length > 0) {
    agstRefsConditions.push({ referenceType: 'SalesInvoice', referenceId: { $in: allSalesInvoiceOids } });
  }
  if (allPurchaseInvoiceOids.length > 0) {
    agstRefsConditions.push({ referenceType: 'PurchaseInvoice', referenceId: { $in: allPurchaseInvoiceOids } });
  }

  const agstRefs = agstRefsConditions.length > 0
    ? await BillReference.find({
        companyId,
        ledgerAccountId: new mongoose.Types.ObjectId(ledgerAccountId),
        $or: agstRefsConditions,
        refType: 'Agst Ref',
      }).lean()
    : [];

  // Map voucherId / referenceId -> array of settled billNumbers and full settlement amounts
  const voucherAgstRefMap = new Map<string, string[]>();
  const voucherSettlementsMap = new Map<string, Array<{ billNumber: string; amount: number }>>();
  for (const ref of agstRefs) {
    const rawId = ref.referenceId.toString();
    const idsToMap = [rawId];
    if (ref.referenceType === 'SalesInvoice') {
      const inv = salesInvMap.get(rawId);
      if (inv?.voucherId) {
        idsToMap.push(inv.voucherId.toString());
      }
    } else if (ref.referenceType === 'PurchaseInvoice') {
      const inv = purchaseInvMap.get(rawId);
      if (inv?.voucherId) {
        idsToMap.push(inv.voucherId.toString());
      }
    }
    for (const idKey of idsToMap) {
      const list = voucherAgstRefMap.get(idKey) || [];
      if (ref.billNumber && !list.includes(ref.billNumber)) {
        list.push(ref.billNumber);
      }
      voucherAgstRefMap.set(idKey, list);

      const sList = voucherSettlementsMap.get(idKey) || [];
      sList.push({ billNumber: ref.billNumber, amount: ref.amount });
      voucherSettlementsMap.set(idKey, sList);
    }
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
    const vIdStr = v?._id?.toString();
    const salesInv = (refType === 'SalesInvoice' && refIdStr ? salesInvMap.get(refIdStr) : undefined)
      || (vIdStr ? salesInvByVoucherMap.get(vIdStr) : undefined);
    const purchaseInv = (refType === 'PurchaseInvoice' && refIdStr ? purchaseInvMap.get(refIdStr) : undefined)
      || (vIdStr ? purchaseInvByVoucherMap.get(vIdStr) : undefined);

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
      const match = textToSearch.match(/(B2C-\d+|B2B-\d+|INV-\d+|PUR-\d+|PURV-\d+|POS-\d+)/i);
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
    const isB2BSale =
      salesInv?.type === 'B2B' ||
      invoiceNo.startsWith('B2B-') ||
      (e.narration || '').includes('B2B') ||
      (v?.narration || '').includes('B2B');
    const isPOSSale =
      salesInv?.type === 'POS' ||
      invoiceNo.startsWith('INV-') ||
      invoiceNo.startsWith('POS-') ||
      (e.narration || '').includes('POS') ||
      (v?.narration || '').includes('POS');

    if (vType === 'Sales' || isB2CSale || isB2BSale || isPOSSale) {
      if (isB2CSale) {
        entryName = 'Sales B2C';
      } else if (isB2BSale) {
        entryName = 'Sales B2B';
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

    // Determine Voucher column value (Sales invoice number for sales)
    let voucherColumnVal = v?.voucherNo || '';
    if ((isB2CSale || isB2BSale || isPOSSale || vType === 'Sales') && invoiceNo) {
      voucherColumnVal = invoiceNo;
    } else if (vType === 'Purchase' && invoiceNo) {
      voucherColumnVal = invoiceNo;
    }

    const isPrimaryInvoice = vType === 'Sales' || vType === 'Purchase' || isB2CSale || isB2BSale || isPOSSale;

    // Determine Reference column value (show settled bill number / against ref / card ref / invoice ref)
    let referenceVal = '-';
    const agstBills = vIdStr ? voucherAgstRefMap.get(vIdStr) : undefined;

    if (agstBills && agstBills.length > 0) {
      referenceVal = agstBills.join(', ');
    } else if (salesInv?.invoiceNo && salesInv.invoiceNo !== voucherColumnVal) {
      referenceVal = salesInv.invoiceNo;
    } else if (purchaseInv?.invoiceNo && purchaseInv.invoiceNo !== voucherColumnVal) {
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
      voucherId: vIdStr,
      voucherType: vType,
      referenceType: refType || (salesInv ? 'SalesInvoice' : purchaseInv ? 'PurchaseInvoice' : undefined),
      referenceId: refIdStr || salesInv?._id?.toString() || purchaseInv?._id?.toString() || vIdStr,
      referenceNo: invoiceNo,
      invoiceType: salesInv?.type || (isB2BSale ? 'B2B' : isB2CSale ? 'B2C' : isPOSSale ? 'POS' : undefined),
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
  if (!voucherId || !mongoose.Types.ObjectId.isValid(voucherId)) {
    return [];
  }
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

export interface TrialBalanceItem {
  ledgerAccountId: string;
  name: string;
  code: string;
  debit: number;
  credit: number;
  groupName?: string;
  groupCode?: string;
  groupType?: string;
}

export async function getTrialBalance(
  companyId: string,
  financialYearId: string,
  asAtDate: Date
): Promise<Array<TrialBalanceItem>> {
  await syncOpeningAccountsLedgerBalance(companyId, financialYearId);
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

  const result: Array<TrialBalanceItem> = [];
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
    const g = acc.groupId as { name?: string; code?: string; type?: string } | null;
    result.push({
      ledgerAccountId: id,
      name: acc.name,
      code: acc.code,
      debit: balance > 0 ? balance : 0,
      credit: balance < 0 ? -balance : 0,
      groupName: g?.name || 'General',
      groupCode: g?.code || '',
      groupType: g?.type ? g.type.toUpperCase() : 'OTHER',
    });
  }

  return result;
}

export interface ProfitLossLedgerItem {
  id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
  amount: number;
}

export interface ProfitLossGroupNode {
  groupId: string;
  groupName: string;
  groupCode?: string;
  category: 'Direct' | 'Indirect';
  type: 'Income' | 'Expense';
  totalAmount: number;
  totalDebit: number;
  totalCredit: number;
  accounts: ProfitLossLedgerItem[];
}

export interface ProfitLossResult {
  income: number;
  expenses: number;
  netProfit: number;
  grossProfit: number;
  directIncome: number;
  indirectIncome: number;
  directExpenses: number;
  indirectExpenses: number;
  tree: {
    income: ProfitLossGroupNode[];
    expenses: ProfitLossGroupNode[];
  };
  groups: Array<{ type: string; name: string; amount: number; groupName?: string; code?: string; category?: string }>;
}

export async function getProfitLoss(
  companyId: string,
  financialYearId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<ProfitLossResult> {
  let effectiveFrom = fromDate;
  let fy: any = null;
  try {
    fy = await FinancialYear.findById(financialYearId).lean();
    if (!effectiveFrom && fy?.startDate) {
      effectiveFrom = new Date(fy.startDate);
      effectiveFrom.setHours(0, 0, 0, 0);
    }
  } catch (_) {}

  let effectiveTo = toDate ? new Date(toDate) : new Date();
  effectiveTo.setHours(23, 59, 59, 999);

  const matchCondition: any = {
    companyId: new mongoose.Types.ObjectId(companyId),
    financialYearId: new mongoose.Types.ObjectId(financialYearId),
  };

  if (effectiveFrom && effectiveTo) {
    matchCondition.date = { $gte: effectiveFrom, $lte: effectiveTo };
  } else if (effectiveTo) {
    matchCondition.date = { $lte: effectiveTo };
  }

  const entries = await LedgerEntry.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: '$ledgerAccountId',
        debit: { $sum: '$debitAmount' },
        credit: { $sum: '$creditAmount' },
      },
    },
  ]);

  const entryMap = new Map<string, { debit: number; credit: number }>(
    entries.map((e) => [e._id.toString(), { debit: e.debit || 0, credit: e.credit || 0 }])
  );

  const accounts = await LedgerAccount.find({ companyId })
    .populate({
      path: 'groupId',
      select: 'name code type parentGroupId isSales isPurchases',
      populate: {
        path: 'parentGroupId',
        select: 'name code type',
      },
    })
    .lean();

  const incomeGroupsMap = new Map<string, ProfitLossGroupNode>();
  const expenseGroupsMap = new Map<string, ProfitLossGroupNode>();
  const legacyGroups: Array<{ type: string; name: string; amount: number; groupName?: string; code?: string; category?: string }> = [];

  let totalIncome = 0;
  let totalExpenses = 0;
  let directIncome = 0;
  let indirectIncome = 0;
  let directExpenses = 0;
  let indirectExpenses = 0;

  for (const acc of accounts) {
    const g = acc.groupId as any;
    const rawType = (g?.type || acc.type || 'Other').toUpperCase();
    const isIncome = rawType === 'INCOME' || rawType === 'REVENUE';
    const isExpense = rawType === 'EXPENSE';

    if (!isIncome && !isExpense) continue;

    const accCodeUpper = (acc.code || '').toUpperCase();
    const accNameUpper = (acc.name || '').toUpperCase();
    const isStockAdjustmentLedger =
      accCodeUpper === 'STKADJG001' ||
      accCodeUpper === 'STKADJL001' ||
      accCodeUpper === 'DMG001' ||
      accNameUpper.includes('STOCK ADJUSTMENT') ||
      accNameUpper.includes('DAMAGE ACCOUNT');

    if (isStockAdjustmentLedger) continue;

    const accId = acc._id.toString();
    const e = entryMap.get(accId);

    const ob = (acc.openingBalances || []).find(
      (b: any) => b.financialYearId && b.financialYearId.toString() === financialYearId
    );
    let debit = (ob && ob.isDebit) ? ob.amount : 0;
    let credit = (ob && !ob.isDebit) ? ob.amount : 0;

    if (e) {
      debit += e.debit;
      credit += e.credit;
    }

    if (isIncome) {
      const net = credit - debit;
      if (Math.abs(net) < 0.005 && debit === 0 && credit === 0) continue;

      totalIncome += net;

      const groupName = (g?.name || 'Direct Income').trim();
      const groupCode = g?.code || '';
      const parentName = (g?.parentGroupId?.name || '').trim();
      const combined = `${groupName} ${parentName} ${groupCode}`.toUpperCase();

      const accNameUpper = (acc.name || '').toUpperCase();
      const isDirect =
        combined.includes('DIR_INCOME') ||
        combined.includes('DIRECT INCOME') ||
        combined.includes('SALE') ||
        accNameUpper.includes('STOCK ADJUSTMENT GAIN') ||
        !!g?.isSales;

      const category: 'Direct' | 'Indirect' = isDirect ? 'Direct' : 'Indirect';
      if (isDirect) {
        directIncome += net;
      } else {
        indirectIncome += net;
      }

      const key = g?._id ? g._id.toString() : groupName;
      let groupNode = incomeGroupsMap.get(key);
      if (!groupNode) {
        groupNode = {
          groupId: key,
          groupName,
          groupCode,
          category,
          type: 'Income',
          totalAmount: 0,
          totalDebit: 0,
          totalCredit: 0,
          accounts: [],
        };
        incomeGroupsMap.set(key, groupNode);
      }

      groupNode.totalAmount += net;
      groupNode.totalDebit += debit;
      groupNode.totalCredit += credit;
      groupNode.accounts.push({
        id: accId,
        code: acc.code,
        name: acc.name,
        debit,
        credit,
        amount: net,
      });

      legacyGroups.push({
        type: 'Income',
        name: acc.name,
        amount: net,
        groupName,
        code: acc.code,
        category,
      });
    } else if (isExpense) {
      const expAmt = debit - credit;
      if (Math.abs(expAmt) < 0.005 && debit === 0 && credit === 0) continue;

      totalExpenses += expAmt;

      const groupName = (g?.name || 'Direct Expense').trim();
      const groupCode = g?.code || '';
      const parentName = (g?.parentGroupId?.name || '').trim();
      const combined = `${groupName} ${parentName} ${groupCode}`.toUpperCase();

      const accNameUpper = (acc.name || '').toUpperCase();
      const isIndirectByName =
        accNameUpper.includes('RENT') ||
        accNameUpper.includes('SALARY') ||
        accNameUpper.includes('SALARIES') ||
        accNameUpper.includes('ELECTRIC') ||
        accNameUpper.includes('TELEPHONE') ||
        accNameUpper.includes('PHONE') ||
        accNameUpper.includes('INTERNET') ||
        accNameUpper.includes('OFFICE') ||
        accNameUpper.includes('STATIONERY') ||
        accNameUpper.includes('DEPRECIATION') ||
        accNameUpper.includes('AUDIT') ||
        accNameUpper.includes('BANK CHARGE') ||
        accNameUpper.includes('LEGAL') ||
        accNameUpper.includes('MAINTENANCE') ||
        accNameUpper.includes('TRAVELLING') ||
        accNameUpper.includes('TRAVEL') ||
        accNameUpper.includes('TEA') ||
        accNameUpper.includes('WATER') ||
        accNameUpper.includes('COMMISSION') ||
        accNameUpper.includes('ADVERTISEMENT') ||
        accNameUpper.includes('MARKETING') ||
        accNameUpper.includes('INSURANCE');

      const isIndirectGroup =
        combined.includes('INDIR_EXP') ||
        combined.includes('INDIRECT');

      const isDirectGroup =
        !isIndirectGroup &&
        (
          combined.includes('DIR_EXP') ||
          /\bDIRECT\b/.test(combined) ||
          combined.includes('PURCH') ||
          combined.includes('COGS') ||
          combined.includes('COST OF GOODS') ||
          combined.includes('FREIGHT') ||
          combined.includes('CARRIAGE IN') ||
          combined.includes('CUSTOM') ||
          combined.includes('IMPORT')
        );

      const isDirect =
        !isIndirectByName &&
        !isIndirectGroup &&
        (
          isDirectGroup ||
          accNameUpper.includes('PURCHASE') ||
          accNameUpper.includes('SALES RETURN') ||
          !!g?.isPurchases
        );

      const category: 'Direct' | 'Indirect' = isDirect ? 'Direct' : 'Indirect';
      if (isDirect) {
        directExpenses += expAmt;
      } else {
        indirectExpenses += expAmt;
      }

      const key = g?._id ? g._id.toString() : groupName;
      let groupNode = expenseGroupsMap.get(key);
      if (!groupNode) {
        groupNode = {
          groupId: key,
          groupName,
          groupCode,
          category,
          type: 'Expense',
          totalAmount: 0,
          totalDebit: 0,
          totalCredit: 0,
          accounts: [],
        };
        expenseGroupsMap.set(key, groupNode);
      }

      groupNode.totalAmount += expAmt;
      groupNode.totalDebit += debit;
      groupNode.totalCredit += credit;
      groupNode.accounts.push({
        id: accId,
        code: acc.code,
        name: acc.name,
        debit,
        credit,
        amount: expAmt,
      });

      legacyGroups.push({
        type: 'Expense',
        name: acc.name,
        amount: expAmt,
        groupName,
        code: acc.code,
        category,
      });
    }
  }

  // Ensure opening stock vouchers are synced to Opening Accounts
  await syncOpeningPurchaseVouchers(companyId);

  // Calculate Opening Stock as the stock valuation before effectiveFrom (Previous Closing Stock)
  let openingStockValuation = 0;
  if (effectiveFrom) {
    const beforeFrom = new Date(effectiveFrom);
    beforeFrom.setHours(0, 0, 0, 0);
    beforeFrom.setMilliseconds(beforeFrom.getMilliseconds() - 1);
    openingStockValuation = await getLiveStockValuation(companyId, beforeFrom, 'fifo', true);
  }

  if (Math.abs(openingStockValuation) > 0.0001) {
    totalExpenses += openingStockValuation;
    directExpenses += openingStockValuation;

    const openingStockGroup: ProfitLossGroupNode = {
      groupId: 'opening_stock_group',
      groupName: 'Opening Stock',
      groupCode: 'STK_OPEN',
      category: 'Direct',
      type: 'Expense',
      totalAmount: openingStockValuation,
      totalDebit: openingStockValuation,
      totalCredit: 0,
      accounts: [
        {
          id: 'opening-stock-live',
          code: 'STOCK001',
          name: 'Opening Stock',
          debit: openingStockValuation,
          credit: 0,
          amount: openingStockValuation,
        },
      ],
    };

    expenseGroupsMap.set('opening_stock_group', openingStockGroup);
    legacyGroups.push({
      type: 'Expense',
      name: 'Opening Stock',
      amount: openingStockValuation,
      groupName: 'Opening Stock',
      code: 'STOCK001',
      category: 'Direct',
    });
  }

  // Include Closing Stock (Live Stock Valuation) under Direct Income in Trading / P&L
  const liveClosingStock = await getLiveStockValuation(companyId, effectiveTo, 'fifo', true);
  if (Math.abs(liveClosingStock) > 0.0001) {
    totalIncome += liveClosingStock;
    directIncome += liveClosingStock;

    const closingStockGroup: ProfitLossGroupNode = {
      groupId: 'closing_stock_group',
      groupName: 'Closing Stock',
      groupCode: 'STK_CLOSE',
      category: 'Direct',
      type: 'Income',
      totalAmount: liveClosingStock,
      totalDebit: 0,
      totalCredit: liveClosingStock,
      accounts: [
        {
          id: 'closing-stock-live',
          code: 'STOCK001',
          name: 'Closing Stock (Live Inventory)',
          debit: 0,
          credit: liveClosingStock,
          amount: liveClosingStock,
        },
      ],
    };

    incomeGroupsMap.set('closing_stock_group', closingStockGroup);
    legacyGroups.push({
      type: 'Income',
      name: 'Closing Stock (Live Inventory)',
      amount: liveClosingStock,
      groupName: 'Closing Stock',
      code: 'STOCK001',
      category: 'Direct',
    });
  }

  // Sort groups: Direct first, then by name
  const incomeTree = Array.from(incomeGroupsMap.values()).sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === 'Direct' ? -1 : 1;
    }
    return a.groupName.localeCompare(b.groupName);
  });

  const expenseTree = Array.from(expenseGroupsMap.values()).sort((a, b) => {
    if (a.category !== b.category) {
      return a.category === 'Direct' ? -1 : 1;
    }
    return a.groupName.localeCompare(b.groupName);
  });

  // Sort accounts inside each group by code or name
  incomeTree.forEach((g) => {
    g.accounts.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
  });
  expenseTree.forEach((g) => {
    g.accounts.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
  });

  const grossProfit = directIncome - directExpenses;
  const netProfit = totalIncome - totalExpenses;

  return {
    income: totalIncome,
    expenses: totalExpenses,
    netProfit,
    grossProfit,
    directIncome,
    indirectIncome,
    directExpenses,
    indirectExpenses,
    tree: {
      income: incomeTree,
      expenses: expenseTree,
    },
    groups: legacyGroups,
  };
}

export interface BalanceSheetLedgerItem {
  id: string;
  code: string;
  name: string;
  debit: number;
  credit: number;
  amount: number;
  groupName?: string;
  groupCode?: string;
  parentName?: string;
}

export interface BalanceSheetGroupNode {
  groupId: string;
  groupName: string;
  groupCode?: string;
  parentName?: string;
  type: 'Asset' | 'Liability' | 'Equity';
  totalAmount: number;
  totalDebit: number;
  totalCredit: number;
  accounts: BalanceSheetLedgerItem[];
}

export interface BalanceSheetParentNode {
  parentId: string;
  parentName: string;
  parentCode?: string;
  type: 'Asset' | 'Liability' | 'Equity';
  totalAmount: number;
  totalDebit: number;
  totalCredit: number;
  groups: BalanceSheetGroupNode[];
}

export interface BalanceSheetResult {
  assets: number;
  liabilities: number;
  equity: number;
  netProfit: number;
  balanced: boolean;
  tree: {
    assets: BalanceSheetParentNode[];
    liabilities: BalanceSheetParentNode[];
    equity: BalanceSheetParentNode[];
  };
  groups: Array<{
    id?: string;
    code?: string;
    name: string;
    type: string;
    groupName?: string;
    groupCode?: string;
    parentName?: string;
    amount: number;
  }>;
}

export async function getBalanceSheet(
  companyId: string,
  financialYearId: string,
  asAtDate: Date
): Promise<BalanceSheetResult> {
  await syncOpeningPurchaseVouchers(companyId);
  const effectiveAsAt = new Date(asAtDate);
  if (!isNaN(effectiveAsAt.getTime())) {
    effectiveAsAt.setHours(23, 59, 59, 999);
  }
  const tb = await getTrialBalance(companyId, financialYearId, effectiveAsAt);
  const accounts = await LedgerAccount.find({ companyId })
    .populate({
      path: 'groupId',
      select: 'name code type parentGroupId',
      populate: {
        path: 'parentGroupId',
        select: 'name code type',
      },
    })
    .lean();
  const tbMap = new Map(tb.map((r) => [r.ledgerAccountId, { debit: r.debit, credit: r.credit }]));
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let income = 0;
  let expenses = 0;

  const assetGroupsMap = new Map<string, BalanceSheetGroupNode>();
  const liabilityGroupsMap = new Map<string, BalanceSheetGroupNode>();
  const equityGroupsMap = new Map<string, BalanceSheetGroupNode>();

  const liveClosingStock = await getLiveStockValuation(companyId, effectiveAsAt, 'fifo', true);
  let hasHandledStockInHand = false;

  const allCompanyGroups = await LedgerGroup.find({ companyId }).lean();
  const groupById = new Map<string, any>(allCompanyGroups.map((grp: any) => [grp._id.toString(), grp]));

  const matchPrimaryHead = (name?: string, code?: string): string | null => {
    const c = (code || '').toUpperCase().trim();
    const n = (name || '').toLowerCase().trim();

    if (c === 'CURRENT_ASSET' || n === 'current asset' || n === 'current assets' || n === 'current_asset') {
      return 'Current Asset';
    }
    if (c === 'FIXED_ASSET' || n === 'fixed asset' || n === 'fixed assets' || n === 'fixed_asset') {
      return 'Fixed Asset';
    }
    if (c === 'CURRENT_LIAB' || n === 'current liability' || n === 'current liabilities' || n === 'current_liab') {
      return 'Current Liability';
    }
    if (c === 'FIXED_LIAB' || n === 'fixed liability' || n === 'fixed liabilities' || n === 'fixed_liab') {
      return 'Fixed Liability';
    }
    if (c === 'CAPITAL' || n === 'capital' || n === 'equity') {
      return 'Capital';
    }
    if (
      c === 'DUTY_RECV' ||
      (n.includes('receivable') && (n.includes('duty') || n.includes('duties') || n.includes('tax') || n.includes('vat')))
    ) {
      return 'Duties and Taxes Receivable';
    }
    if (
      c === 'DUTY_PAY' ||
      (n.includes('payable') && (n.includes('duty') || n.includes('duties') || n.includes('tax') || n.includes('vat')))
    ) {
      return 'Duties and Taxes Payable';
    }
    return null;
  };

  const getCanonicalCode = (name: string): string => {
    switch (name) {
      case 'Current Asset': return 'CURRENT_ASSET';
      case 'Fixed Asset': return 'FIXED_ASSET';
      case 'Duties and Taxes Receivable': return 'DUTY_RECV';
      case 'Current Liability': return 'CURRENT_LIAB';
      case 'Fixed Liability': return 'FIXED_LIAB';
      case 'Duties and Taxes Payable': return 'DUTY_PAY';
      case 'Capital': return 'CAPITAL';
      default: return name.toUpperCase().replace(/\s+/g, '_');
    }
  };

  const resolveAccountParent = (
    accGroup: any,
    accType: string,
    debit: number,
    credit: number
  ): { name: string; code: string; id: string } => {
    let curr = accGroup?._id ? groupById.get(accGroup._id.toString()) || accGroup : accGroup;

    let depth = 0;
    while (curr && depth < 10) {
      const matched = matchPrimaryHead(curr.name, curr.code);
      if (matched) {
        const canonicalDoc = allCompanyGroups.find((cg: any) => matchPrimaryHead(cg.name, cg.code) === matched);
        return {
          name: matched,
          code: canonicalDoc?.code || getCanonicalCode(matched),
          id: canonicalDoc ? canonicalDoc._id.toString() : matched.toLowerCase().replace(/\s+/g, '_'),
        };
      }
      if (curr.parentGroupId) {
        const pId = typeof curr.parentGroupId === 'object' && curr.parentGroupId !== null
          ? (curr.parentGroupId as any)._id?.toString() || curr.parentGroupId.toString()
          : curr.parentGroupId.toString();
        curr = groupById.get(pId);
        depth++;
      } else {
        break;
      }
    }

    const rawType = (accGroup?.type || accType || '').toUpperCase();
    let fallbackName = 'Current Asset';
    if (rawType === 'EQUITY') {
      fallbackName = 'Capital';
    } else if (rawType === 'LIABILITY' || ['SUPPLIER'].includes(rawType)) {
      fallbackName = (accGroup?.name || '').toLowerCase().includes('fixed') || (accGroup?.name || '').toLowerCase().includes('long')
        ? 'Fixed Liability'
        : 'Current Liability';
    } else if (rawType === 'DUTIES AND TAXES') {
      fallbackName = (accGroup?.name || '').toLowerCase().includes('receivable') || debit > credit
        ? 'Duties and Taxes Receivable'
        : 'Duties and Taxes Payable';
    } else {
      fallbackName = (accGroup?.name || '').toLowerCase().includes('fixed')
        ? 'Fixed Asset'
        : 'Current Asset';
    }

    const canonicalDoc = allCompanyGroups.find((cg: any) => matchPrimaryHead(cg.name, cg.code) === fallbackName);
    return {
      name: fallbackName,
      code: canonicalDoc?.code || getCanonicalCode(fallbackName),
      id: canonicalDoc ? canonicalDoc._id.toString() : fallbackName.toLowerCase().replace(/\s+/g, '_'),
    };
  };

  const groups: Array<{
    id?: string;
    code?: string;
    name: string;
    type: string;
    groupName?: string;
    groupCode?: string;
    parentName?: string;
    amount: number;
  }> = [];

  const addToGroup = (
    map: Map<string, BalanceSheetGroupNode>,
    gKey: string,
    gName: string,
    gCode: string,
    parentName: string,
    secType: 'Asset' | 'Liability' | 'Equity',
    accId: string,
    accCode: string,
    accName: string,
    debit: number,
    credit: number,
    amt: number
  ) => {
    let node = map.get(gKey);
    if (!node) {
      node = {
        groupId: gKey,
        groupName: gName,
        groupCode: gCode,
        parentName: parentName,
        type: secType,
        totalAmount: 0,
        totalDebit: 0,
        totalCredit: 0,
        accounts: [],
      };
      map.set(gKey, node);
    }
    node.totalAmount += amt;
    node.totalDebit += debit;
    node.totalCredit += credit;
    node.accounts.push({
      id: accId,
      code: accCode,
      name: accName,
      debit,
      credit,
      amount: amt,
      groupName: gName,
      groupCode: gCode,
      parentName: parentName,
    });
  };

  for (const acc of accounts) {
    const g = acc.groupId as any;
    let type = (g?.type || g?.parentGroupId?.type || acc.type || 'Other').toUpperCase();

    // Fallbacks based on ledger account classification if group type is missing
    if (['BANK', 'CASH', 'CUSTOMER'].includes(type)) type = 'ASSET';
    else if (['SUPPLIER'].includes(type)) type = 'LIABILITY';
    else if (['REVENUE'].includes(type)) type = 'INCOME';
    else if (['EXPENSES'].includes(type)) type = 'EXPENSE';

    const t = tbMap.get(acc._id.toString());
    const debit = t?.debit ?? 0;
    const credit = t?.credit ?? 0;
    const accId = acc._id.toString();
    const accCode = acc.code || '';
    const accName = acc.name;
    const gKey = g?._id ? g._id.toString() : (g?.name || 'General');
    const gName = (g?.name || 'General').trim();
    const gCode = g?.code || '';

    const accCodeUpper = accCode.toUpperCase();
    const accNameUpper = (accName || '').toUpperCase();
    const isStockInHand = accCodeUpper === 'STOCK001' || accNameUpper === 'STOCK IN HAND' || accNameUpper === 'STOCK IN HAND A/C';

    if (type === 'ASSET') {
      let amt = debit - credit;
      let effectiveDebit = debit;
      let effectiveCredit = credit;

      if (isStockInHand) {
        amt = liveClosingStock;
        effectiveDebit = liveClosingStock;
        effectiveCredit = 0;
        hasHandledStockInHand = true;
      }

      assets += amt;
      if (Math.abs(amt) > 0.01) {
        const parentInfo = resolveAccountParent(g, 'ASSET', effectiveDebit, effectiveCredit);
        groups.push({ id: accId, code: accCode, name: accName, type: 'Asset', groupName: gName, groupCode: gCode, parentName: parentInfo.name, amount: amt });
        addToGroup(assetGroupsMap, gKey, gName, gCode, parentInfo.name, 'Asset', accId, accCode, accName, effectiveDebit, effectiveCredit, amt);
      }
    } else if (type === 'LIABILITY') {
      const amt = credit - debit;
      liabilities += amt;
      if (Math.abs(amt) > 0.01) {
        const parentInfo = resolveAccountParent(g, 'LIABILITY', debit, credit);
        groups.push({ id: accId, code: accCode, name: accName, type: 'Liability', groupName: gName, groupCode: gCode, parentName: parentInfo.name, amount: amt });
        addToGroup(liabilityGroupsMap, gKey, gName, gCode, parentInfo.name, 'Liability', accId, accCode, accName, debit, credit, amt);
      }
    } else if (type === 'EQUITY') {
      const amt = credit - debit;
      equity += amt;
      if (Math.abs(amt) > 0.01) {
        const parentInfo = resolveAccountParent(g, 'EQUITY', debit, credit);
        groups.push({ id: accId, code: accCode, name: accName, type: 'Equity', groupName: gName, groupCode: gCode, parentName: parentInfo.name, amount: amt });
        addToGroup(equityGroupsMap, gKey, gName, gCode, parentInfo.name, 'Equity', accId, accCode, accName, debit, credit, amt);
      }
    } else if (type === 'INCOME') {
      const amt = credit - debit;
      income += amt;
    } else if (type === 'EXPENSE') {
      const amt = debit - credit;
      expenses += amt;
    } else if (type === 'DUTIES AND TAXES') {
      const groupNameLower = (g?.name || '').toLowerCase();
      if (groupNameLower.includes('receivable') || debit > credit) {
        const amt = debit - credit;
        assets += amt;
        if (Math.abs(amt) > 0.01) {
          const parentInfo = resolveAccountParent(g, 'DUTIES AND TAXES', debit, credit);
          groups.push({ id: accId, code: accCode, name: accName, type: 'Asset', groupName: gName, groupCode: gCode, parentName: parentInfo.name, amount: amt });
          addToGroup(assetGroupsMap, gKey, gName, gCode, parentInfo.name, 'Asset', accId, accCode, accName, debit, credit, amt);
        }
      } else {
        const amt = credit - debit;
        liabilities += amt;
        if (Math.abs(amt) > 0.01) {
          const parentInfo = resolveAccountParent(g, 'DUTIES AND TAXES', debit, credit);
          groups.push({ id: accId, code: accCode, name: accName, type: 'Liability', groupName: gName, groupCode: gCode, parentName: parentInfo.name, amount: amt });
          addToGroup(liabilityGroupsMap, gKey, gName, gCode, parentInfo.name, 'Liability', accId, accCode, accName, debit, credit, amt);
        }
      }
    } else {
      // Fallback for unclassified accounts with non-zero balances
      const bal = debit - credit;
      if (Math.abs(bal) > 0.01) {
        if (bal > 0) {
          assets += bal;
          const parentInfo = resolveAccountParent(g, 'ASSET', debit, credit);
          groups.push({ id: accId, code: accCode, name: `${accName} (Unclassified)`, type: 'Asset', groupName: gName || 'General', groupCode: gCode || 'GEN', parentName: parentInfo.name, amount: bal });
          addToGroup(assetGroupsMap, gKey, gName || 'General', gCode || 'GEN', parentInfo.name, 'Asset', accId, accCode, `${accName} (Unclassified)`, debit, credit, bal);
        } else {
          const lAmt = credit - debit;
          liabilities += lAmt;
          const parentInfo = resolveAccountParent(g, 'LIABILITY', debit, credit);
          groups.push({ id: accId, code: accCode, name: `${accName} (Unclassified)`, type: 'Liability', groupName: gName || 'General', groupCode: gCode || 'GEN', parentName: parentInfo.name, amount: lAmt });
          addToGroup(liabilityGroupsMap, gKey, gName || 'General', gCode || 'GEN', parentInfo.name, 'Liability', accId, accCode, `${accName} (Unclassified)`, debit, credit, lAmt);
        }
      }
    }
  }

  // Ensure live closing stock is included in stock in hand if not already handled
  if (!hasHandledStockInHand && Math.abs(liveClosingStock) > 0.0001) {
    const parentInfo = resolveAccountParent(null, 'ASSET', liveClosingStock, 0);
    assets += liveClosingStock;
    groups.push({
      id: 'stock-in-hand-live',
      code: 'STOCK001',
      name: 'STOCK IN HAND',
      type: 'Asset',
      groupName: 'Current Asset',
      groupCode: 'CURRENT_ASSET',
      parentName: parentInfo.name,
      amount: liveClosingStock,
    });
    addToGroup(
      assetGroupsMap,
      'current_asset_group',
      'Current Asset',
      'CURRENT_ASSET',
      parentInfo.name,
      'Asset',
      'stock-in-hand-live',
      'STOCK001',
      'STOCK IN HAND',
      liveClosingStock,
      0,
      liveClosingStock
    );
  }

  // Include live closing stock in income for balance sheet net profit calculation
  income += liveClosingStock;


  const netProfit = income - expenses;
  if (Math.abs(netProfit) > 0.01) {
    const pnlName = netProfit >= 0 ? 'Profit & Loss (Current Period Net Profit)' : 'Profit & Loss (Current Period Net Loss)';
    const capitalParent = resolveAccountParent(null, 'EQUITY', 0, 0);
    groups.push({
      id: 'net-profit-period',
      code: 'PNL-NET',
      name: pnlName,
      type: 'Equity',
      groupName: 'Reserves & Surplus',
      groupCode: 'RES_SURP',
      parentName: capitalParent.name,
      amount: netProfit,
    });
    addToGroup(
      equityGroupsMap,
      'reserves_and_surplus',
      'Reserves & Surplus',
      'RES_SURP',
      capitalParent.name,
      'Equity',
      'net-profit-period',
      'PNL-NET',
      pnlName,
      netProfit < 0 ? Math.abs(netProfit) : 0,
      netProfit >= 0 ? netProfit : 0,
      netProfit
    );
  }

  // Build 3-level hierarchy: Parent -> Group -> Ledger
  const groupIntoParents = (
    map: Map<string, BalanceSheetGroupNode>,
    secType: 'Asset' | 'Liability' | 'Equity',
    parentOrder: string[]
  ): BalanceSheetParentNode[] => {
    const parentMap = new Map<string, BalanceSheetParentNode>();

    for (const group of map.values()) {
      group.accounts.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));

      const pName = group.parentName || (secType === 'Asset' ? 'Current Asset' : secType === 'Liability' ? 'Current Liability' : 'Capital');
      let parentNode = parentMap.get(pName);
      if (!parentNode) {
        parentNode = {
          parentId: pName.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          parentName: pName,
          parentCode: getCanonicalCode(pName),
          type: secType,
          totalAmount: 0,
          totalDebit: 0,
          totalCredit: 0,
          groups: [],
        };
        parentMap.set(pName, parentNode);
      }
      parentNode.totalAmount += group.totalAmount;
      parentNode.totalDebit += group.totalDebit;
      parentNode.totalCredit += group.totalCredit;
      parentNode.groups.push(group);
    }

    // Sort groups in each parent
    for (const pNode of parentMap.values()) {
      pNode.groups.sort((a, b) => (a.groupCode || a.groupName).localeCompare(b.groupCode || b.groupName));
    }

    // Sort parents according to canonical parentOrder
    return Array.from(parentMap.values()).sort((a, b) => {
      const idxA = parentOrder.indexOf(a.parentName);
      const idxB = parentOrder.indexOf(b.parentName);
      if (idxA !== -1 && idxB !== -1 && idxA !== idxB) return idxA - idxB;
      if (idxA !== -1 && idxB === -1) return -1;
      if (idxA === -1 && idxB !== -1) return 1;
      return a.parentName.localeCompare(b.parentName);
    });
  };

  const assetTree = groupIntoParents(assetGroupsMap, 'Asset', ['Current Asset', 'Fixed Asset', 'Duties and Taxes Receivable']);
  const liabilityTree = groupIntoParents(liabilityGroupsMap, 'Liability', ['Current Liability', 'Fixed Liability', 'Duties and Taxes Payable']);
  const equityTree = groupIntoParents(equityGroupsMap, 'Equity', ['Capital']);

  // Sort flat groups: Asset first, then Liability, then Equity, then by code or name
  const typeOrder: Record<string, number> = { Asset: 1, Liability: 2, Equity: 3 };
  groups.sort((a, b) => {
    const orderA = typeOrder[a.type] || 99;
    const orderB = typeOrder[b.type] || 99;
    if (orderA !== orderB) return orderA - orderB;
    const parentDiff = (a.parentName || '').localeCompare(b.parentName || '');
    if (parentDiff !== 0) return parentDiff;
    return (a.code || a.name).localeCompare(b.code || b.name);
  });

  const totalEquity = equity + netProfit;
  const balanced = Math.abs(assets - (liabilities + totalEquity)) < 0.02;

  return {
    assets: Math.round(assets * 100) / 100,
    liabilities: Math.round(liabilities * 100) / 100,
    equity: Math.round(totalEquity * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    balanced,
    tree: {
      assets: assetTree,
      liabilities: liabilityTree,
      equity: equityTree,
    },
    groups,
  };
}

export interface DayBookFilters {
  fromDate?: Date;
  toDate?: Date;
  voucherType?: string;
  search?: string;
  page?: number;
  limit?: number;
  all?: boolean;
}

export async function getDayBook(
  companyId: string,
  financialYearId: string,
  filters: DayBookFilters = {}
) {
  const query: Record<string, unknown> = {
    companyId: new mongoose.Types.ObjectId(companyId),
    financialYearId: new mongoose.Types.ObjectId(financialYearId),
  };

  if (filters.fromDate || filters.toDate) {
    query.date = {};
    if (filters.fromDate) {
      (query.date as Record<string, Date>).$gte = filters.fromDate;
    }
    if (filters.toDate) {
      (query.date as Record<string, Date>).$lte = filters.toDate;
    }
  }

  if (filters.voucherType && filters.voucherType !== 'ALL') {
    query.voucherType = filters.voucherType;
  }

  const allMatching = await Voucher.find(query)
    .populate('lines.ledgerAccountId', 'name code type')
    .sort({ date: -1, voucherNo: -1 })
    .lean();

  let filtered = allMatching;
  if (filters.search && filters.search.trim()) {
    const s = filters.search.trim().toLowerCase();
    filtered = allMatching.filter((v: any) => {
      const vNo = (v.voucherNo || '').toLowerCase();
      const refNo = (v.referenceNo || '').toLowerCase();
      const narr = (v.narration || '').toLowerCase();
      const vType = (v.voucherType || '').toLowerCase();
      const lineMatch = v.lines?.some((l: any) => {
        const accName = (l.ledgerAccountId?.name || '').toLowerCase();
        const accCode = (l.ledgerAccountId?.code || '').toLowerCase();
        const lineNarr = (l.narration || '').toLowerCase();
        return accName.includes(s) || accCode.includes(s) || lineNarr.includes(s);
      });
      return vNo.includes(s) || refNo.includes(s) || narr.includes(s) || vType.includes(s) || lineMatch;
    });
  }

  const totalCount = filtered.length;
  let totalDebit = 0;
  let totalCredit = 0;
  const typeCounts: Record<string, number> = {};
  const typeTotals: Record<string, { debit: number; credit: number; count: number }> = {};

  for (const v of filtered as any[]) {
    const debit = v.totalDebit || 0;
    const credit = v.totalCredit || 0;
    totalDebit += debit;
    totalCredit += credit;
    const type = v.voucherType || 'Other';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
    if (!typeTotals[type]) {
      typeTotals[type] = { debit: 0, credit: 0, count: 0 };
    }
    typeTotals[type].debit += debit;
    typeTotals[type].credit += credit;
    typeTotals[type].count += 1;
  }

  if (filters.all) {
    return {
      vouchers: filtered,
      totalCount,
      page: 1,
      limit: totalCount,
      totalPages: 1,
      summary: {
        totalTransactions: totalCount,
        totalDebit: parseFloat(totalDebit.toFixed(2)),
        totalCredit: parseFloat(totalCredit.toFixed(2)),
        netMovement: parseFloat((totalDebit - totalCredit).toFixed(2)),
        typeCounts,
        typeTotals,
      },
    };
  }

  const page = Math.max(1, filters.page || 1);
  const limit = filters.limit ? Math.min(filters.limit, 500) : 100;
  const startIndex = (page - 1) * limit;
  const paginatedVouchers = filtered.slice(startIndex, startIndex + limit);

  return {
    vouchers: paginatedVouchers,
    totalCount,
    page,
    limit,
    totalPages: Math.ceil(totalCount / limit) || 1,
    summary: {
      totalTransactions: totalCount,
      totalDebit: parseFloat(totalDebit.toFixed(2)),
      totalCredit: parseFloat(totalCredit.toFixed(2)),
      netMovement: parseFloat((totalDebit - totalCredit).toFixed(2)),
      typeCounts,
      typeTotals,
    },
  };
}

