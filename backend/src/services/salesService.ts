import mongoose from 'mongoose';
import { SalesInvoice } from '../models/SalesInvoice';
import { SalesInvoiceItem } from '../models/SalesInvoiceItem';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { Product } from '../models/Product';
import { ProductCategory } from '../models/ProductCategory';
import { Company } from '../models/Company';
import { LedgerAccount } from '../models/LedgerAccount';
import { LedgerGroup } from '../models/LedgerGroup';
import { Voucher } from '../models/Voucher';
import { Doctor } from '../models/Doctor';
import { Patient } from '../models/Patient';
import { AppError } from '../middlewares/errorHandler';
import * as ledgerService from './ledgerService';
import * as voucherService from './voucherService';
import * as billReferenceService from './billReferenceService';
import { riayatiHl7Service, RiayatiPatientVisit, RiayatiDispenseRequest } from './hl7/riayatiHl7Service';

/**
 * Find or auto-create a LedgerGroup by type.
 */
async function findOrCreateGroup(companyId: string, type: string) {
  let group = await LedgerGroup.findOne({ companyId, type });
  if (group) return group;
  const lastGrp = await LedgerGroup.findOne({ companyId, code: /^GRP/ }).sort({ code: -1 }).lean();
  const num = lastGrp?.code ? parseInt(lastGrp.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `GRP${num.toString().padStart(4, '0')}`;
  group = await LedgerGroup.create({ companyId, name: `${type} Group`, code, type });
  console.log(`[Auto-created] ${type} Group: ${code}`);
  return group;
}

/**
 * Find or auto-create the "Sales Account" ledger.
 */
async function findOrCreateSalesLedger(companyId: string) {
  let ledger = await LedgerAccount.findOne({ companyId, name: 'Sales Account' });
  if (ledger) return ledger;
  // Match exact "Sales" or "Sales Account" only (not "Sales Returns" etc.)
  ledger = await LedgerAccount.findOne({ companyId, name: /^sales\s*account$/i });
  if (ledger) return ledger;
  ledger = await LedgerAccount.findOne({ companyId, type: 'Revenue', name: /^sales$/i });
  if (ledger) return ledger;
  // Auto-create
  const group = await findOrCreateGroup(companyId, 'Income');
  const lastAcc = await LedgerAccount.findOne({ companyId, code: /^ACC/ }).sort({ code: -1 }).lean();
  const num = lastAcc?.code ? parseInt(lastAcc.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `ACC${num.toString().padStart(4, '0')}`;
  ledger = await LedgerAccount.create({
    companyId, name: 'Sales Account', code, type: 'Revenue',
    groupId: group._id,
  });
  console.log(`[Auto-created] Sales Account ledger: ${code}`);
  return ledger;
}

/**
 * Find or auto-create the "VAT Payable" ledger.
 */
async function findOrCreateVatLedger(companyId: string) {
  let ledger = await LedgerAccount.findOne({ companyId, name: 'VAT Payable' });
  if (ledger) return ledger;
  // Match "VAT Payable" or "VAT Output" only (not "VAT Input" / "VAT Receivable" etc.)
  ledger = await LedgerAccount.findOne({ companyId, name: /^vat\s*(payable|output)$/i });
  if (ledger) return ledger;
  // Auto-create
  let group = await LedgerGroup.findOne({ companyId, name: /duties and taxes payable/i, parentGroupId: { $ne: null } });
  if (!group) {
    group = await LedgerGroup.findOne({ companyId, name: /duties and taxes payable/i });
  }
  if (!group) {
    group = await findOrCreateGroup(companyId, 'Liability');
  }
  const lastAcc = await LedgerAccount.findOne({ companyId, code: /^ACC/ }).sort({ code: -1 }).lean();
  const num = lastAcc?.code ? parseInt(lastAcc.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `ACC${num.toString().padStart(4, '0')}`;
  ledger = await LedgerAccount.create({
    companyId, name: 'VAT Payable', code, type: 'Other',
    groupId: group._id,
  });
  console.log(`[Auto-created] VAT Payable ledger: ${code}`);
  return ledger;
}

/**
 * Generic helper: find or auto-create a ledger account by exact name.
 */
async function findOrCreateSpecialLedger(
  companyId: string,
  name: string,
  type: 'Revenue' | 'Expense' | 'Other',
  groupType: string,
) {
  let ledger = await LedgerAccount.findOne({ companyId, name });
  if (ledger) return ledger;
  // Case-insensitive fallback
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  ledger = await LedgerAccount.findOne({ companyId, name: new RegExp(`^${escaped}$`, 'i') });
  if (ledger) return ledger;
  // Auto-create
  const group = await findOrCreateGroup(companyId, groupType);
  const lastAcc = await LedgerAccount.findOne({ companyId, code: /^ACC/ }).sort({ code: -1 }).lean();
  const num = lastAcc?.code ? parseInt(lastAcc.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `ACC${num.toString().padStart(4, '0')}`;
  ledger = await LedgerAccount.create({ companyId, name, code, type, groupId: group._id });
  console.log(`[Auto-created] ${name} ledger: ${code}`);
  return ledger;
}

/**
 * Find or auto-create the "Sales Returns" ledger under DIRECT EXPENSES A/C group.
 */
async function findOrCreateSalesReturnLedger(companyId: string) {
  let dirExpHead = await LedgerGroup.findOne({
    companyId,
    $or: [
      { code: 'DIR_EXP' },
      { name: /^direct\s*expenses?$/i, parentGroupId: null },
      { name: /^direct\s*expenses?$/i },
    ],
  });
  if (!dirExpHead) {
    dirExpHead = await LedgerGroup.create({
      companyId,
      name: 'Direct Expense',
      code: 'DIR_EXP',
      type: 'EXPENSE',
    });
  }

  let group = await LedgerGroup.findOne({
    companyId,
    $or: [
      { code: 'DIR_EXP_AC' },
      { name: /^direct\s*expenses?\s*a\/?c$/i },
      { name: /^direct\s*expenses?$/i, parentGroupId: { $ne: null } },
    ],
  });
  if (group) {
    if (!group.parentGroupId) {
      await LedgerGroup.updateOne({ _id: group._id }, { $set: { parentGroupId: dirExpHead._id } });
      group.parentGroupId = dirExpHead._id as any;
    }
  } else {
    group = await LedgerGroup.create({
      companyId,
      name: 'DIRECT EXPENSES A/C',
      code: 'DIR_EXP_AC',
      type: 'EXPENSE',
      parentGroupId: dirExpHead._id,
    });
  }

  let ledger = await LedgerAccount.findOne({
    companyId,
    name: /^(sales\s*returns?|return\s*inward)$/i,
  });

  if (ledger) {
    if (ledger.groupId?.toString() !== group._id.toString() || ledger.type !== 'Expense') {
      await LedgerAccount.updateOne(
        { _id: ledger._id },
        { $set: { groupId: group._id, type: 'Expense' } }
      );
      ledger.groupId = group._id;
      ledger.type = 'Expense';
    }
    return ledger;
  }

  // Auto-create
  const lastAcc = await LedgerAccount.findOne({ companyId, code: /^ACC/ }).sort({ code: -1 }).lean();
  const num = lastAcc?.code ? parseInt(lastAcc.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `ACC${num.toString().padStart(4, '0')}`;
  ledger = await LedgerAccount.create({
    companyId,
    name: 'Sales Returns',
    code,
    type: 'Expense',
    groupId: group._id,
  });
  console.log(`[Auto-created] Sales Returns ledger under Direct Expenses A/C: ${code}`);
  return ledger;
}

export interface POSLineItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  vatRate?: number;
  batchNumber?: string;
  expiryDate?: string;
  multiUnitId?: string;
  dosageInstructions?: {
    duration?: string;
    durationUnit?: string;
    timing?: string;
    frequency?: string;
    summary?: string;
  };
  duration?: string;
  timing?: string;
  frequency?: string;
  description?: string;
  productName?: string;
}

export interface POSPayment {
  mode: string;
  amount: number;
  reference?: string;
  accountId?: string;
}

export interface CreatePOSSaleInput {
  companyId: string;
  financialYearId: string;
  items: POSLineItem[];
  billDiscount?: number;
  roundOff?: number;
  paymentDetails: POSPayment[];
  paymentType?: 'Cash' | 'Credit';
  cashReceived?: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerTRN?: string;
  cashAccountId?: string;
  cardAccountId?: string;
  salesmanId?: string;
  emiratesId?: string;
  patientName?: string;
  doctorName?: string;
  doctorLicenseNo?: string;
  visitNumber?: string;
  isRiayati?: boolean;
  prescriptionNumber?: string;
  prescriptionDate?: string;
  createdBy?: string;
}

function getVatRate(vatCategory: string, companyVatRate: number): number {
  if (vatCategory === 'exempt' || vatCategory === 'zero') return 0;
  return companyVatRate;
}

export async function getNextInvoiceNo(
  companyId: string,
  financialYearId: string,
  type: string
): Promise<string> {
  const prefix = 'INV';
  const last = await SalesInvoice.findOne({ companyId, financialYearId, type })
    .sort({ invoiceNo: -1 })
    .lean();
  if (!last?.invoiceNo) return `${prefix}-0001`;
  // Extract only the numeric part after the dash or space
  const match = last.invoiceNo.match(/[- ]+(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${num.toString().padStart(4, '0')}`;
}

export async function createPOSSale(input: CreatePOSSaleInput): Promise<{ invoiceId: string; invoiceNo: string; riayatiSubmission?: any }> {
  const company = await Company.findById(input.companyId);
  if (!company) throw new AppError('Company not found', 404);
  const vatRatePct = company.vatConfig?.standardRate ?? 5;
  const date = new Date();

  let grossAmount = 0;
  let discountAmount = input.billDiscount ?? 0;
  const lineItems: Array<{
    productId: mongoose.Types.ObjectId;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    netAmount: number;
    vatRate: number;
    vatAmount: number;
    totalAmount: number;
    costPriceAtSale: number;
    batchNumber?: string;
    expiryDate?: string;
    duration?: string;
    timing?: string;
    frequency?: string;
  }> = [];

  // Track cumulative stock consumed per product across all line items in this POS sale (Sales Invoice procedure)
  const usedStockMap = new Map<string, number>();

  for (const item of input.items) {
    const product = await Product.findById(item.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${item.productId}`, 404);
    }

    // Check available stock before allowing sale (procedure on sales invoice window)
    const pid = product._id.toString();
    const stockAgg = await InventoryTransaction.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(input.companyId),
          productId: product._id,
        },
      },
      {
        $group: {
          _id: null,
          totalIn: { $sum: '$quantityIn' },
          totalOut: { $sum: '$quantityOut' },
        },
      },
    ]);
    const totalAvailable = stockAgg.length > 0 ? stockAgg[0].totalIn - stockAgg[0].totalOut : 0;
    const alreadyUsed = usedStockMap.get(pid) ?? 0;
    const remainingStock = totalAvailable - alreadyUsed;

    // For multi-unit sales, the actual stock consumed is qty * conversion
    let requiredStock = item.quantity;
    if (item.multiUnitId && product.multiUnits) {
      const mu = product.multiUnits.find((m: any) => m.multiUnitId === item.multiUnitId);
      if (mu && mu.conversion && mu.conversion > 0) {
        requiredStock = item.quantity * mu.conversion;
      }
    }

    if (remainingStock < requiredStock) {
      throw new AppError(
        `Insufficient stock for "${product.name}". Available: ${remainingStock}, Required: ${requiredStock}`,
        400
      );
    }

    usedStockMap.set(pid, alreadyUsed + requiredStock);

    const lineDiscount = item.discount ?? 0;
    const netBeforeVat = item.quantity * item.unitPrice - lineDiscount;
    const vatRate = (item.vatRate ?? getVatRate(product.vatCategory, vatRatePct)) / 100;
    const vatAmount = netBeforeVat * vatRate;
    const totalAmount = netBeforeVat + vatAmount;
    grossAmount += item.quantity * item.unitPrice;
    discountAmount += lineDiscount;
    lineItems.push({
      productId: product._id,
      description: product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: lineDiscount,
      netAmount: netBeforeVat,
      vatRate: vatRate * 100,
      vatAmount,
      totalAmount,
      costPriceAtSale: product.purchasePrice ?? 0,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      duration: item.duration || item.dosageInstructions?.duration,
      timing: item.timing || item.dosageInstructions?.timing,
      frequency: item.frequency || item.dosageInstructions?.frequency,
    });
  }

  const taxableAmount = grossAmount - discountAmount;
  const vatAmount = lineItems.reduce((s, l) => s + l.vatAmount, 0);
  const roundOff = input.roundOff ?? 0;
  const totalAmount = taxableAmount + vatAmount + roundOff;

  const invoiceNo = await getNextInvoiceNo(
    input.companyId,
    input.financialYearId,
    'POS'
  );

  const isCredit = input.paymentType === 'Credit';
  // If paymentDetails provided, respect them regardless of paymentType
  const paymentRows = input.paymentDetails ?? [];
  let cashPart = paymentRows.filter((p) => /cash/i.test(p.mode)).reduce((s, p) => s + (p.amount || 0), 0);
  if (cashPart === 0 && input.cashReceived && input.cashReceived > 0) {
    cashPart = input.cashReceived;
  }
  let cardPart = paymentRows.filter((p) => /card/i.test(p.mode)).reduce((s, p) => s + (p.amount || 0), 0);
  if (cardPart > totalAmount + 0.01) {
    throw new AppError(
      `Card amount (${cardPart.toFixed(2)}) cannot exceed invoice total (${totalAmount.toFixed(2)})`,
      400
    );
  }
  if (!isCredit && cashPart === 0 && cardPart === 0) {
    cashPart = totalAmount;
  }
  const paidTotal = Math.min(cashPart + cardPart, totalAmount);
  const invoiceBalance = Math.max(0, parseFloat((totalAmount - paidTotal).toFixed(2)));

  let cashLedger = null;
  if (input.cashAccountId) {
    cashLedger = await LedgerAccount.findById(input.cashAccountId);
  }
  if (!cashLedger) {
    cashLedger = await LedgerAccount.findOne({
      companyId: input.companyId,
      name: /cash\s*in\s*hand/i,
    });
  }
  if (!cashLedger) {
    cashLedger = await LedgerAccount.findOne({
      companyId: input.companyId,
      type: 'Cash',
    });
  }

  const effectiveCustomerName = input.customerId
    ? (input.customerName || 'Customer')
    : (input.customerName && input.customerName !== 'Walk-in' ? input.customerName : (cashLedger?.name || 'CASH IN HAND'));

  const customerLedger = input.customerId ? await LedgerAccount.findById(input.customerId) : null;
  const hasCustomerAc = !!customerLedger;

  const invoice = await SalesInvoice.create({
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    invoiceNo,
    date,
    time: date.toTimeString().slice(0, 8),
    type: 'POS',
    customerId: input.customerId,
    customerName: effectiveCustomerName,
    cashAccountId: cashLedger?._id,
    customerTRN: input.customerTRN,
    salesmanId: input.salesmanId,
    rateType: 'Retail',
    paymentType: isCredit ? 'Credit' : 'Cash',
    vatType: 'Vat',
    emiratesId: input.emiratesId,
    patientName: input.patientName,
    doctorName: input.doctorName,
    prescriptionNumber: input.prescriptionNumber,
    prescriptionDate: input.prescriptionDate,
    isRiayati: input.isRiayati ?? false,
    grossAmount,
    discountAmount,
    taxableAmount,
    vatAmount,
    roundOff,
    totalAmount,
    cashReceived: cashPart,
    balance: invoiceBalance,
    oldBalance: 0,
    netBalance: invoiceBalance,
    cardAccountId: input.cardAccountId ? new mongoose.Types.ObjectId(input.cardAccountId) : (paymentRows.find((p) => /card/i.test(p.mode) && p.accountId)?.accountId ? new mongoose.Types.ObjectId(paymentRows.find((p) => /card/i.test(p.mode) && p.accountId)!.accountId) : undefined),
    paymentDetails: (() => {
      const rows = [...paymentRows];
      if (cashPart > 0 && !rows.some((p) => /cash/i.test(p.mode))) {
        rows.unshift({
          mode: 'Cash',
          amount: cashPart,
          accountId: cashLedger?._id ? cashLedger._id.toString() : undefined,
        });
      }
      return rows.map((p) => ({
        mode: p.mode,
        amount: p.amount,
        reference: p.reference,
        accountId: p.accountId
          ? new mongoose.Types.ObjectId(p.accountId)
          : (/card/i.test(p.mode) && input.cardAccountId
            ? new mongoose.Types.ObjectId(input.cardAccountId)
            : (/cash/i.test(p.mode) && cashLedger ? cashLedger._id : undefined)),
      }));
    })(),
    status: 'Final',
    createdBy: input.createdBy,
  });

  for (const line of lineItems) {
    await SalesInvoiceItem.create({
      invoiceId: invoice._id,
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      netAmount: line.netAmount,
      vatRate: line.vatRate,
      vatAmount: line.vatAmount,
      totalAmount: line.totalAmount,
      costPriceAtSale: line.costPriceAtSale,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate,
      duration: (line as any).duration,
      timing: (line as any).timing,
      frequency: (line as any).frequency,
    });
  }

  const salesLedger = await findOrCreateSalesLedger(input.companyId);
  const vatLedger = await findOrCreateVatLedger(input.companyId);

  const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];

  let cardLedger = null;
  if (cardPart > 0) {
    const cardAccId = paymentRows.find((p) => /card/i.test(p.mode) && p.accountId)?.accountId || input.cardAccountId;
    if (cardAccId) {
      cardLedger = await LedgerAccount.findById(cardAccId);
    }
    if (!cardLedger) {
      cardLedger = await LedgerAccount.findOne({
        companyId: input.companyId,
        $or: [
          { isCardAccount: true },
          { name: /card\s*clearing/i },
          { name: /card/i },
          { type: 'Bank' },
        ],
      });
    }
    if (!cardLedger) {
      cardLedger = await findOrCreateSpecialLedger(input.companyId, 'Card Clearing Account', 'Other', 'Asset');
    }
  }

  if (hasCustomerAc) {
    // Debit the customer with the full sale, then settle whatever was tendered (none for a credit sale)
    voucherLines.push({
      ledgerAccountId: customerLedger!._id.toString(),
      debitAmount: totalAmount,
      creditAmount: 0,
      narration: `POS ${invoiceNo}${isCredit ? ' - Credit Sale' : ' - Sale'}`,
    });
    if (cashPart > 0 && cashLedger) {
      voucherLines.push({
        ledgerAccountId: cashLedger._id.toString(),
        debitAmount: cashPart,
        creditAmount: 0,
        narration: `POS ${invoiceNo} - Cash Payment`,
      });
      voucherLines.push({
        ledgerAccountId: customerLedger!._id.toString(),
        debitAmount: 0,
        creditAmount: cashPart,
        narration: `POS ${invoiceNo} - Cash Payment`,
      });
    }
    if (cardPart > 0) {
      const cardLedgerId = cardLedger?._id?.toString() || cashLedger?._id?.toString();
      if (cardLedgerId) {
        voucherLines.push({
          ledgerAccountId: cardLedgerId,
          debitAmount: cardPart,
          creditAmount: 0,
          narration: `POS ${invoiceNo} - Card Payment`,
        });
        voucherLines.push({
          ledgerAccountId: customerLedger!._id.toString(),
          debitAmount: 0,
          creditAmount: cardPart,
          narration: `POS ${invoiceNo} - Card Payment`,
        });
      }
    }
  } else {
    if (cashLedger && cashPart > 0) {
      voucherLines.push({
        ledgerAccountId: cashLedger._id.toString(),
        debitAmount: cashPart,
        creditAmount: 0,
        narration: `POS ${invoiceNo}${cardPart > 0 ? ' - Cash' : ''}`,
      });
    }
    if (cardLedger && cardPart > 0) {
      voucherLines.push({
        ledgerAccountId: cardLedger._id.toString(),
        debitAmount: cardPart,
        creditAmount: 0,
        narration: `POS ${invoiceNo}${cashPart > 0 ? ' - Card' : ''}`,
      });
    } else if (!cardLedger && cardPart > 0 && cashLedger) {
      voucherLines.push({
        ledgerAccountId: cashLedger._id.toString(),
        debitAmount: cardPart,
        creditAmount: 0,
        narration: `POS ${invoiceNo}${cashPart > 0 ? ' - Card' : ''}`,
      });
    }
  }
  if (salesLedger) {
    const salesCredit = vatLedger && vatAmount > 0 ? taxableAmount : totalAmount - (vatAmount || 0);
    voucherLines.push({
      ledgerAccountId: salesLedger._id.toString(),
      debitAmount: 0,
      creditAmount: salesCredit,
      narration: `POS ${invoiceNo}`,
    });
  }
  if (vatLedger && vatAmount > 0) {
    voucherLines.push({
      ledgerAccountId: vatLedger._id.toString(),
      debitAmount: 0,
      creditAmount: vatAmount,
      narration: `POS ${invoiceNo}`,
    });
  }

  let createdVoucher: any = null;
  if (voucherLines.length >= 2) {
    const totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = totalDebit - totalCredit;
    if (Math.abs(diff) > 0.01 && salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: diff > 0 ? 0 : Math.abs(diff),
        creditAmount: diff > 0 ? diff : 0,
        narration: 'Round',
      });
    }
    createdVoucher = await voucherService.createAndPost({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      voucherType: 'Sales',
      date,
      narration: `POS Sale ${invoiceNo}`,
      lines: voucherLines,
      referenceType: 'SalesInvoice',
      referenceId: invoice._id.toString(),
      referenceNo: invoiceNo,
      createdBy: input.createdBy,
    });
    await SalesInvoice.updateOne(
      { _id: invoice._id },
      { $set: { voucherId: createdVoucher._id } }
    );
  }

  // Bill references — New Ref for the receivable, Agst Ref for whatever was paid against the sales reference
  const billPartyAccountId = input.customerId || (cashLedger ? cashLedger._id.toString() : undefined);
  if (billPartyAccountId && totalAmount > 0) {
    try {
      await billReferenceService.deleteRefsBySource('SalesInvoice', invoice._id.toString());
      if (createdVoucher?._id) {
        await billReferenceService.deleteRefsBySource('Voucher', createdVoucher._id.toString());
      }
      await billReferenceService.createNewRef({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        ledgerAccountId: billPartyAccountId,
        billNumber: invoiceNo,
        referenceType: 'SalesInvoice',
        referenceId: invoice._id.toString(),
        date,
        amount: totalAmount,
        drCr: 'Dr',
        narration: `POS Sale ${invoiceNo}`,
      });

      if (cashPart > 0) {
        await billReferenceService.createAgstRef({
          companyId: input.companyId,
          financialYearId: input.financialYearId,
          ledgerAccountId: billPartyAccountId,
          billNumber: invoiceNo,
          referenceType: 'SalesInvoice',
          referenceId: invoice._id.toString(),
          date,
          amount: cashPart,
          drCr: 'Cr',
          narration: `POS ${invoiceNo} - Cash Payment`,
        });
      }

      if (cardPart > 0) {
        const cardRow = paymentRows.find((p) => /card/i.test(p.mode));
        const cardRefNote = cardRow?.reference ? ` (Ref: ${cardRow.reference})` : '';
        await billReferenceService.createAgstRef({
          companyId: input.companyId,
          financialYearId: input.financialYearId,
          ledgerAccountId: billPartyAccountId,
          billNumber: invoiceNo,
          referenceType: 'SalesInvoice',
          referenceId: invoice._id.toString(),
          date,
          amount: cardPart,
          drCr: 'Cr',
          narration: `POS ${invoiceNo} - Card Payment${cardRefNote}`,
        });
      }
    } catch (err) {
      console.error(`[POS ${invoiceNo}] Bill reference creation failed:`, err);
    }
  }

  for (const line of lineItems) {
    await InventoryTransaction.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      productId: line.productId,
      date,
      type: 'Sales',
      quantityIn: 0,
      quantityOut: line.quantity,
      costPrice: line.costPriceAtSale,
      referenceType: 'SalesInvoice',
      referenceId: invoice._id,
      batchNumber: line.batchNumber || undefined,
      createdBy: input.createdBy,
    });
  }

  let riayatiSubmissionResult: any = null;

  if (input.isRiayati) {
    riayatiSubmissionResult = await executeRiayatiSubmission({
      companyId: input.companyId,
      invoiceId: invoice._id,
      invoiceNo,
      visitNumber: input.visitNumber,
      emiratesId: input.emiratesId,
      patientName: input.patientName,
      doctorName: input.doctorName,
      doctorLicenseNo: input.doctorLicenseNo,
      customerPhone: input.customerPhone,
      customerAddress: input.customerAddress,
      date,
      items: input.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        description: it.description || it.productName,
        batchNumber: it.batchNumber,
        expiryDate: it.expiryDate,
        dosageInstructions: it.dosageInstructions,
        duration: it.duration || it.dosageInstructions?.duration,
        timing: it.timing || it.dosageInstructions?.timing,
        frequency: it.frequency || it.dosageInstructions?.frequency,
      })),
    });
  }

  return {
    invoiceId: invoice._id.toString(),
    invoiceNo: invoice.invoiceNo,
    riayatiSubmission: riayatiSubmissionResult,
  };
}

export async function executeRiayatiSubmission(params: {
  companyId: string;
  invoiceId: mongoose.Types.ObjectId | string;
  invoiceNo: string;
  visitNumber?: string;
  emiratesId?: string;
  patientName?: string;
  doctorName?: string;
  doctorLicenseNo?: string;
  customerPhone?: string;
  customerAddress?: string;
  date: Date;
  items: Array<{
    productId: string;
    quantity: number;
    description?: string;
    batchNumber?: string;
    expiryDate?: string | Date;
    dosageInstructions?: any;
    duration?: string;
    timing?: string;
    frequency?: string;
  }>;
}): Promise<any> {
  let riayatiSubmissionResult: any = null;
  const {
    companyId,
    invoiceId,
    invoiceNo,
    date,
    items,
  } = params;

  try {
    const visitNumber = params.visitNumber || `VN-${invoiceNo}`;

    // Look up doctor details
    let doctorLic = params.doctorLicenseNo;
    let doctorName = params.doctorName || 'Dr. General (OTC)';
    let doctorAuth = 'MOHAP';

    if (!doctorLic && params.doctorName) {
      const cleanDocName = params.doctorName.replace(/^Dr\.\s*/i, '').trim();
      const foundDoc = await Doctor.findOne({
        companyId,
        name: new RegExp(cleanDocName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      }).lean();
      if (foundDoc) {
        doctorLic = foundDoc.licenseNumber;
        doctorName = foundDoc.name;
        doctorAuth = foundDoc.licensingAuthority || 'MOHAP';
      }
    }
    if (!doctorLic) {
      doctorLic = 'MOH-GEN01'; // safe fallback
    }

    // Look up patient details
    let patEid = params.emiratesId;
    let patName = params.patientName || 'Walk-in Patient';
    let patFamily = '';
    let patDob: Date | undefined;
    let patGender: string | undefined;
    let patMrn: string | undefined;
    let patPhone: string | undefined = params.customerPhone;
    let patLang: string | undefined;
    let patStreet: string | undefined;
    let patCity: string | undefined;
    let patEmirate: string | undefined;
    let patCountry: string | undefined;

    if (patEid || params.patientName) {
      const queryCond: any = { companyId };
      if (patEid) {
        queryCond.emiratesId = patEid.trim();
      } else if (params.patientName && params.patientName !== 'Walk-in Patient') {
        queryCond.fullName = new RegExp(`^${params.patientName.trim()}$`, 'i');
      }

      if (queryCond.emiratesId || queryCond.fullName) {
        const foundPat = await Patient.findOne(queryCond).lean();
        if (foundPat) {
          patEid = foundPat.emiratesId || patEid;
          patName = foundPat.firstName || foundPat.fullName || patName;
          patFamily = foundPat.familyName || '';
          patGender = foundPat.gender;
          patMrn = foundPat.mrn;
          if (foundPat.phone) patPhone = foundPat.phone;
          if (foundPat.language) patLang = foundPat.language;
          if (foundPat.street) patStreet = foundPat.street;
          if (foundPat.city) patCity = foundPat.city;
          if (foundPat.emirate) patEmirate = foundPat.emirate;
          if (foundPat.country) patCountry = foundPat.country;
          if (foundPat.dob) {
            const parsed = new Date(foundPat.dob);
            if (!isNaN(parsed.getTime())) patDob = parsed;
          }
        }
      }
    }

    if (!patStreet && params.customerAddress) {
      patStreet = params.customerAddress;
    }

    const visit: RiayatiPatientVisit = {
      visitNumber,
      emiratesId: patEid,
      patientName: patName,
      patientFamilyName: patFamily,
      patientMrn: patMrn,
      patientDob: patDob,
      patientGender: patGender,
      patientPhone: patPhone,
      patientLanguage: patLang,
      patientAddress: patStreet,
      patientCity: patCity,
      patientEmirate: patEmirate,
      patientCountry: patCountry,
      doctorLicenseNo: doctorLic,
      doctorName: doctorName,
      doctorLicenseProvider: doctorAuth,
    };

    // Retrieve product information for dispense items
    const productIds = items.map((i) => i.productId);
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const dispenses: RiayatiDispenseRequest[] = items.map((it) => {
      const prod = productMap.get(it.productId);
      const strengthNum = prod?.strength ? parseFloat(prod.strength) : 500;
      const pkgSizeNum = prod?.packageSize ? parseFloat(prod.packageSize) : 1;
      const freqCount = parseFloat(it.frequency || it.dosageInstructions?.frequency || '1') || 1;
      const totalDailyDose = !isNaN(strengthNum) ? strengthNum * freqCount : undefined;

      return {
        visitNumber,
        invoiceNo,
        emiratesId: patEid,
        patientName: patName,
        patientFamilyName: patFamily,
        patientMrn: patMrn,
        patientDob: patDob,
        patientGender: patGender,
        patientPhone: patPhone,
        patientLanguage: patLang,
        patientAddress: patStreet,
        patientCity: patCity,
        patientEmirate: patEmirate,
        patientCountry: patCountry,
        doctorLicenseNo: doctorLic!,
        doctorName: doctorName,
        doctorLicenseProvider: doctorAuth,
        drugCode: prod?.officialCode || prod?.code || 'MED-001',
        drugDescription: it.description || prod?.name || prod?.genericName || 'MEDICATION',
        dispensedAt: date,
        quantity: it.quantity,
        duration: it.duration || it.dosageInstructions?.duration || '30',
        timing: it.timing || it.dosageInstructions?.timing || 'Before Food',
        frequency: it.frequency || it.dosageInstructions?.frequency || '1',
        totalDailyDose: totalDailyDose,
        unit: prod?.packageUnit || 'TAB',
        route: prod?.routeOfAdmin || 'PO,ORAL',
        dosageForm: prod?.dosageForm || 'TAB,TABLET',
        strength: isNaN(strengthNum) ? 500 : strengthNum,
        strengthUnit: prod?.strengthUnit || 'MG',
        lotNumber: it.batchNumber || 'BATCH01',
        expiryDate: it.expiryDate ? new Date(it.expiryDate) : undefined,
        manufacturer: prod?.manufacturer || 'PHARMA',
        packageSize: isNaN(pkgSizeNum) ? 1 : pkgSizeNum,
        packageUnit: prod?.packageUnit || 'BOX',
        gtin: prod?.imei || prod?.internationalBarcode || '',
        dispenseType: 'N',
        medicineCodeProvider: prod?.medCodeProvider || 'DDC',
      };
    });

    // Submit HL7 flow: ADT^A04 -> RDS^O13 -> ADT^A03
    riayatiSubmissionResult = await riayatiHl7Service.submitFullDispenseFlow(visit, dispenses);

    // Record result in invoice
    await SalesInvoice.updateOne(
      { _id: invoiceId },
      {
        $set: {
          riayatiStatus: riayatiSubmissionResult.status,
          riayatiVisitNumber: visitNumber,
          riayatiAckCode: riayatiSubmissionResult.ackCode,
          riayatiError: riayatiSubmissionResult.error,
          riayatiSubmittedAt: new Date(),
        },
      }
    );
  } catch (riayatiErr: any) {
    console.warn(`[Riayati] Submission handled gracefully for ${invoiceNo}: ${riayatiErr.message}`);
    riayatiSubmissionResult = {
      success: false,
      status: 'Failed',
      error: riayatiErr.message,
    };
    await SalesInvoice.updateOne(
      { _id: invoiceId },
      {
        $set: {
          riayatiStatus: 'Failed',
          riayatiError: riayatiErr.message,
          riayatiSubmittedAt: new Date(),
        },
      }
    );
  }

  return riayatiSubmissionResult;
}

export async function getInvoice(invoiceId: string, companyId: string) {
  const invoice = await SalesInvoice.findOne({ _id: invoiceId, companyId })
    .populate('customerId', 'name code')
    .lean();
  if (!invoice) return null;
  const items = await SalesInvoiceItem.find({ invoiceId }).populate('productId', 'name sku systemBarcode code imei').lean();
  return { ...invoice, items };
}

// ==================== B2C Sales ====================

export interface B2CLineItem {
  productId: string;
  productCode?: string;
  imei?: string;
  multiUnitId?: string;
  unitId?: string;
  unitName?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discount?: number;
  vatRate?: number;
  batchNumber?: string;
  expiryDate?: string;
  isRx?: boolean;
  dosageInstructions?: any;
  duration?: string;
  timing?: string;
  frequency?: string;
}

export interface B2CPayment {
  mode: string;
  amount: number;
  reference?: string;
  accountId?: string;
}

export interface CreateB2CSaleInput {
  companyId: string;
  financialYearId: string;
  date?: string;
  type?: 'B2C' | 'B2B' | 'Quotation' | 'POS';
  items: B2CLineItem[];
  customerId?: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  salesmanId?: string;
  rateType?: 'Retail' | 'WSale' | 'Special1' | 'Special2';
  paymentType?: 'Cash' | 'Credit';
  vatType?: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  cashAccountId?: string;
  cardAccountId?: string;
  otherDiscount?: number;
  otherCharges?: number;
  freightCharge?: number;
  lendAddLess?: number;
  roundOff?: number;
  cashReceived?: number;
  oldBalance?: number;
  paymentDetails?: B2CPayment[];
  narration?: string;
  // Shipping Address
  shippingName?: string;
  shippingAddress?: string;
  shippingPhone?: string;
  shippingContactPerson?: string;
  patientName?: string;
  doctorName?: string;
  doctorLicenseNo?: string;
  emiratesId?: string;
  prescriptionNumber?: string;
  prescriptionDate?: string;
  isRiayati?: boolean;
  visitNumber?: string;
  createdBy?: string;
}

export async function getNextB2CInvoiceNo(companyId: string, financialYearId: string, type: 'B2C' | 'B2B' | 'Quotation' | 'POS' = 'B2C'): Promise<string> {
  const prefix = type === 'Quotation' ? 'QTN' : type;
  const last = await SalesInvoice.findOne({ companyId, financialYearId, type })
    .sort({ invoiceNo: -1 })
    .lean();
  if (!last?.invoiceNo) return `${prefix}-000001`;
  // Extract only the numeric part after the dash
  const match = last.invoiceNo.match(/-(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${num.toString().padStart(6, '0')}`;
}

export async function createB2CSale(input: CreateB2CSaleInput): Promise<{ invoiceId: string; invoiceNo: string; riayatiSubmission?: any }> {
  const company = await Company.findById(input.companyId);
  if (!company) throw new AppError('Company not found', 404);

  const vatRatePct = input.vatType === 'NonVat' ? 0 : (company.vatConfig?.standardRate ?? 5);
  const saleDate = input.date ? new Date(input.date) : new Date();

  let itemsGross = 0;
  let itemsDiscount = 0;
  let itemsVat = 0;

  const lineItems: Array<{
    productId: mongoose.Types.ObjectId;
    productCode: string;
    imei: string;
    multiUnitId?: string;
    unitId?: string;
    unitName?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    grossAmount: number;
    discountPercent: number;
    discount: number;
    netAmount: number;
    vatRate: number;
    vatAmount: number;
    totalAmount: number;
    costPriceAtSale: number;
    batchNumber?: string;
    expiryDate?: string;
    duration?: string;
    timing?: string;
    frequency?: string;
  }> = [];

  // Track cumulative stock consumed per product across all line items in this invoice
  const usedStockMap = new Map<string, number>();

  for (const item of input.items) {
    const product = await Product.findById(item.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${item.productId}`, 404);
    }

    if (input.type !== 'Quotation') {
      // Check available stock before allowing sale
      const pid = product._id.toString();
      const stockAgg = await InventoryTransaction.aggregate([
        {
          $match: {
            companyId: new mongoose.Types.ObjectId(input.companyId),
            productId: product._id,
          },
        },
        {
          $group: {
            _id: null,
            totalIn: { $sum: '$quantityIn' },
            totalOut: { $sum: '$quantityOut' },
          },
        },
      ]);
      const totalAvailable = stockAgg.length > 0 ? stockAgg[0].totalIn - stockAgg[0].totalOut : 0;
      const alreadyUsed = usedStockMap.get(pid) ?? 0;
      const remainingStock = totalAvailable - alreadyUsed;

      // For multi-unit sales, the actual stock consumed is qty * conversion
      let requiredStock = item.quantity;
      if (item.multiUnitId && product.multiUnits) {
        const mu = product.multiUnits.find((m) => m.multiUnitId === item.multiUnitId);
        if (mu && mu.conversion && mu.conversion > 0) {
          requiredStock = item.quantity * mu.conversion;
        }
      }

      if (remainingStock < requiredStock) {
        throw new AppError(
          `Insufficient stock for "${product.name}". Available: ${remainingStock}, Required: ${requiredStock}`,
          400
        );
      }

      // Track what this line consumes
      usedStockMap.set(pid, alreadyUsed + requiredStock);
    }

    const qty = item.quantity;
    const price = item.unitPrice;
    const gross = qty * price;
    const discPct = item.discountPercent ?? 0;
    const disc = item.discount ?? (gross * discPct / 100);
    const net = gross - disc;
    const vatRate = input.vatType === 'NonVat' ? 0 : (item.vatRate ?? vatRatePct);
    // Match frontend: inclusive = price includes VAT (extract VAT); exclusive = VAT on top
    const taxMode = input.taxMode ?? 'exclusive';
    let vatAmt: number;
    let total: number;
    if (input.vatType === 'Vat' && taxMode === 'inclusive' && vatRate > 0) {
      vatAmt = parseFloat((net * vatRate / (100 + vatRate)).toFixed(2));
      total = parseFloat(net.toFixed(2));
    } else {
      vatAmt = parseFloat((net * (vatRate / 100)).toFixed(2));
      total = parseFloat((net + vatAmt).toFixed(2));
    }

    itemsGross += gross;
    itemsDiscount += disc;
    itemsVat += vatAmt;

    lineItems.push({
      productId: product._id,
      productCode: item.productCode ?? product.code ?? '',
      imei: item.imei ?? product.imei ?? '',
      multiUnitId: item.multiUnitId,
      unitId: item.unitId,
      unitName: item.unitName,
      description: item.description ?? product.name,
      quantity: qty,
      unitPrice: price,
      grossAmount: gross,
      discountPercent: discPct,
      discount: disc,
      netAmount: net,
      vatRate,
      vatAmount: vatAmt,
      totalAmount: total,
      costPriceAtSale: product.purchasePrice ?? 0,
      batchNumber: item.batchNumber,
      expiryDate: item.expiryDate,
      duration: item.duration || item.dosageInstructions?.duration,
      timing: item.timing || item.dosageInstructions?.timing,
      frequency: item.frequency || item.dosageInstructions?.frequency,
    });
  }

  const otherDiscount = input.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? 0;
  const lendAddLess = input.lendAddLess ?? 0;
  const roundOff = input.roundOff ?? 0;

  // When Vat: adjustments are inclusive of tax — total VAT includes VAT in adjustments; post net (VAT-excluded) to adjustment ledgers
  const isVat = input.vatType !== 'NonVat';
  const netAdjustments = otherCharges + freightCharge + lendAddLess + roundOff - otherDiscount;
  const vatFromAdjustments = isVat && netAdjustments !== 0
    ? parseFloat((netAdjustments * vatRatePct / (100 + vatRatePct)).toFixed(2))
    : 0;
  const totalVat = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));
  const netFactor = isVat ? 100 / (100 + vatRatePct) : 1;
  const otherDiscountNet = parseFloat((otherDiscount * netFactor).toFixed(2));
  const otherChargesNet = parseFloat((otherCharges * netFactor).toFixed(2));
  const freightChargeNet = parseFloat((freightCharge * netFactor).toFixed(2));
  const lendAddLessNet = parseFloat((lendAddLess * netFactor).toFixed(2));
  const roundOffNet = parseFloat((roundOff * netFactor).toFixed(2));

  const taxableAmount = itemsGross - itemsDiscount;
  // Inclusive: line total = net (amount includes VAT), so sum of line totals = taxableAmount. Exclusive: line total = net + vat, so subTotal = taxableAmount + itemsVat.
  const subTotal = (input.taxMode === 'inclusive' && isVat) ? taxableAmount : (taxableAmount + itemsVat);
  const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + lendAddLess + roundOff;

  const cardTotal = (input.paymentDetails ?? []).filter((pd) => /card/i.test(pd.mode)).reduce((s, pd) => s + (pd.amount || 0), 0);
  const isCredit = input.paymentType === 'Credit';
  const cashPaid = input.cashReceived !== undefined && input.cashReceived > 0
    ? Math.min(input.cashReceived, Math.max(0, grandTotal - cardTotal))
    : (isCredit ? 0 : Math.max(0, grandTotal - cardTotal));
  const totalPaid = cardTotal + cashPaid;
  const cashReceived = input.cashReceived !== undefined
    ? input.cashReceived
    : (isCredit ? 0 : Math.max(0, grandTotal - cardTotal));
  const balance = grandTotal - totalPaid;
  const oldBalance = 0; // Could be fetched from customer account
  const netBalance = balance + oldBalance;

  // Synthesize paymentDetails to guarantee both cash and card details are stored
  const effectivePaymentDetails = [...(input.paymentDetails ?? [])];
  const hasCashRow = effectivePaymentDetails.some((pd) => /cash/i.test(pd.mode));
  if (!hasCashRow && cashPaid > 0) {
    effectivePaymentDetails.unshift({
      mode: 'Cash',
      amount: cashPaid,
      accountId: input.cashAccountId as any,
    });
  }

  const type = input.type || 'B2C';
  const invoiceNo = await getNextB2CInvoiceNo(input.companyId, input.financialYearId, type);

  // Create invoice, items, and inventory in a single flow with rollback on failure
  let invoice: { _id: mongoose.Types.ObjectId; invoiceNo: string } | null = null;
  try {
    const created = await SalesInvoice.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      invoiceNo,
      date: saleDate,
      time: saleDate.toTimeString().slice(0, 8),
      type,
      customerId: input.customerId,
      customerName: input.customerName ?? 'Walk-in',
      customerAddress: input.customerAddress,
      customerPhone: input.customerPhone,
      salesmanId: input.salesmanId,
      rateType: input.rateType ?? 'Retail',
      paymentType: input.paymentType ?? 'Cash',
      vatType: input.vatType ?? 'Vat',
      cashAccountId: input.cashAccountId,
      grossAmount: itemsGross,
      discountAmount: itemsDiscount,
      taxableAmount,
      vatAmount: totalVat,
      otherDiscount,
      otherCharges,
      freightCharge,
      lendAddLess,
      roundOff,
      totalAmount: grandTotal,
      cashReceived,
      balance,
      oldBalance,
      netBalance,
      paymentDetails: effectivePaymentDetails,
      narration: input.narration,
      // Shipping Address
      shippingName: input.shippingName,
      shippingAddress: input.shippingAddress,
      shippingPhone: input.shippingPhone,
      shippingContactPerson: input.shippingContactPerson,
      emiratesId: input.emiratesId,
      patientName: input.patientName,
      doctorName: input.doctorName,
      prescriptionNumber: input.prescriptionNumber,
      prescriptionDate: input.prescriptionDate,
      isRiayati: input.isRiayati ?? false,
      status: 'Final',
      createdBy: input.createdBy,
    });
    invoice = { _id: created._id, invoiceNo: created.invoiceNo };

    for (const line of lineItems) {
      await SalesInvoiceItem.create({
        invoiceId: invoice._id,
        productId: line.productId,
        productCode: line.productCode,
        imei: line.imei,
        multiUnitId: line.multiUnitId,
        unitId: line.unitId,
        unitName: line.unitName,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        grossAmount: line.grossAmount,
        discountPercent: line.discountPercent,
        discount: line.discount,
        netAmount: line.netAmount,
        vatRate: line.vatRate,
        vatAmount: line.vatAmount,
        totalAmount: line.totalAmount,
        costPriceAtSale: line.costPriceAtSale,
        batchNumber: line.batchNumber,
        expiryDate: line.expiryDate,
        duration: line.duration,
        timing: line.timing,
        frequency: line.frequency,
      });
    }

    // Create inventory transactions
    if (input.type !== 'Quotation') {
      for (const line of lineItems) {
        // For multi-unit sales, reduce stock by conversion (pcs inside) instead of line qty
        let stockQtyOut = line.quantity;
        if (line.multiUnitId) {
          const prod = await Product.findById(line.productId).lean();
          if (prod && prod.multiUnits) {
            const mu = prod.multiUnits.find((m) => m.multiUnitId === line.multiUnitId);
            if (mu && mu.conversion && mu.conversion > 0) {
              stockQtyOut = line.quantity * mu.conversion;
            }
          }
        }

        await InventoryTransaction.create({
          companyId: input.companyId,
          financialYearId: input.financialYearId,
          productId: line.productId,
          date: saleDate,
          type: 'Sales',
          quantityIn: 0,
          quantityOut: stockQtyOut,
          costPrice: line.costPriceAtSale,
          referenceType: 'SalesInvoice',
          referenceId: invoice._id,
          batchNumber: line.batchNumber || undefined,
          createdBy: input.createdBy,
        });
      }
    }
  } catch (err) {
    // Rollback: clean up any partially created records
    if (invoice) {
      await SalesInvoiceItem.deleteMany({ invoiceId: invoice._id }).catch(() => { });
      await InventoryTransaction.deleteMany({ referenceId: invoice._id, referenceType: 'SalesInvoice' }).catch(() => { });
      await SalesInvoice.deleteOne({ _id: invoice._id }).catch(() => { });
    }
    throw err;
  }

  if (input.type === 'Quotation') {
    return {
      invoiceId: invoice!._id.toString(),
      invoiceNo: invoice!.invoiceNo,
    };
  }

  // ── Create accounting entries ─────────────────────────────────────
  console.log(`[B2C ${invoiceNo}] Accounting: itemsGross=${itemsGross}, itemsDiscount=${itemsDiscount}, itemsVat=${itemsVat}, totalVat=${totalVat}, otherDiscount=${otherDiscount}, otherCharges=${otherCharges}, freightCharge=${freightCharge}, lendAddLess=${lendAddLess}, roundOff=${roundOff}, grandTotal=${grandTotal}`);

  const cashLedger = input.cashAccountId
    ? await LedgerAccount.findById(input.cashAccountId)
    : await LedgerAccount.findOne({ companyId: input.companyId, type: 'Cash' });

  const salesLedger = await findOrCreateSalesLedger(input.companyId);
  const vatLedger = await findOrCreateVatLedger(input.companyId);
  const customerLedger = input.customerId ? await LedgerAccount.findById(input.customerId) : null;
  let defaultCardLedger = null;
  if (cardTotal > 0) {
    defaultCardLedger = await LedgerAccount.findOne({
      companyId: input.companyId,
      $or: [{ isCardAccount: true }, { name: /card\s*clearing/i }, { name: /card/i }],
    });
    if (!defaultCardLedger) {
      defaultCardLedger = await LedgerAccount.findOne({ companyId: input.companyId, type: 'Bank' });
    }
  }

  // Look up special ledger accounts (only when the amount is non-zero)
  const discountOnSalesLedger = itemsDiscount > 0
    ? await findOrCreateSpecialLedger(input.companyId, 'Discount on Sales', 'Expense', 'Expense') : null;
  const otherDiscountLedger = otherDiscount > 0
    ? await findOrCreateSpecialLedger(input.companyId, 'Other Discount on Sales', 'Expense', 'Expense') : null;
  const otherChargesLedger = otherCharges > 0
    ? await findOrCreateSpecialLedger(input.companyId, 'Other Charges on Sales', 'Revenue', 'Income') : null;
  const freightChargesLedger = freightCharge > 0
    ? await findOrCreateSpecialLedger(input.companyId, 'Freight Charges on Sales', 'Revenue', 'Income') : null;
  const travelChargesLedger = lendAddLess > 0
    ? await findOrCreateSpecialLedger(input.companyId, 'Travel Charges on Sales', 'Revenue', 'Income') : null;
  const roundOffLedger = Math.abs(roundOff) > 0.001
    ? await findOrCreateSpecialLedger(input.companyId, 'Round Off on Sales', 'Expense', 'Expense') : null;

  const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];

  /** Helper: push the shared credit/debit lines for discounts, charges, round-off */
  const pushSpecialLines = () => {
    // Debit: Discount on Sales (sum of all row-level discounts)
    if (discountOnSalesLedger && itemsDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: discountOnSalesLedger._id.toString(),
        debitAmount: itemsDiscount,
        creditAmount: 0,
        narration: `B2C ${invoiceNo} - Row Discounts`,
      });
    }
    // Debit: Other Discount on Sales (net = VAT-excluded when Vat)
    if (otherDiscountLedger && otherDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: otherDiscountLedger._id.toString(),
        debitAmount: otherDiscountNet,
        creditAmount: 0,
        narration: `B2C ${invoiceNo} - Other Discount`,
      });
    }
    // Credit: Other Charges on Sales (net when Vat)
    if (otherChargesLedger && otherCharges > 0) {
      voucherLines.push({
        ledgerAccountId: otherChargesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: otherChargesNet,
        narration: `B2C ${invoiceNo} - Other Charges`,
      });
    }
    // Credit: Freight Charges on Sales (net when Vat)
    if (freightChargesLedger && freightCharge > 0) {
      voucherLines.push({
        ledgerAccountId: freightChargesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: freightChargeNet,
        narration: `B2C ${invoiceNo} - Freight Charges`,
      });
    }
    // Credit: Travel Charges on Sales (net when Vat)
    if (travelChargesLedger && lendAddLess > 0) {
      voucherLines.push({
        ledgerAccountId: travelChargesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: lendAddLessNet,
        narration: `B2C ${invoiceNo} - Travel Charges`,
      });
    }
    // Round Off on Sales (net when Vat; debit if negative, credit if positive)
    if (roundOffLedger && Math.abs(roundOff) > 0.001) {
      voucherLines.push({
        ledgerAccountId: roundOffLedger._id.toString(),
        debitAmount: roundOffNet < 0 ? Math.abs(roundOffNet) : 0,
        creditAmount: roundOffNet > 0 ? roundOffNet : 0,
        narration: `B2C ${invoiceNo} - Round Off`,
      });
    }
  };

  const hasCustomerAc = !!customerLedger;
  const isCashPayment = input.paymentType !== 'Credit';

  if (hasCustomerAc) {
    // ── Customer A/C selected ──
    // Step 1: Debit Customer A/C with Grand Total (record sale to customer)
    voucherLines.push({
      ledgerAccountId: customerLedger!._id.toString(),
      debitAmount: grandTotal,
      creditAmount: 0,
      narration: `B2C ${invoiceNo} - Sale`,
    });

    // Credit: Sales A/C with GROSS amount (before discounts)
    if (salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: itemsGross,
        narration: `B2C ${invoiceNo}`,
      });
    }

    // Credit: VAT A/C (total output VAT = items + VAT in adjustments when Vat)
    if (vatLedger && totalVat > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: 0,
        creditAmount: totalVat,
        narration: `B2C ${invoiceNo}`,
      });
    }

    // Discount, Charges & Round-off entries (net amounts when Vat)
    pushSpecialLines();

    // Step 2: Payment entries — settle customer account for any amount paid (Card / Cash)
    if (input.paymentDetails && input.paymentDetails.length > 0) {
      for (const pd of input.paymentDetails.filter((p) => !/cash/i.test(p.mode))) {
        const accId = pd.accountId || defaultCardLedger?._id.toString();
        if (pd.amount > 0 && accId) {
          const cardRefStr = pd.reference ? ` (Ref: ${pd.reference})` : '';
          voucherLines.push({
            ledgerAccountId: accId,
            debitAmount: pd.amount,
            creditAmount: 0,
            narration: `B2C ${invoiceNo} - ${pd.mode} Payment${cardRefStr}`,
          });
          voucherLines.push({
            ledgerAccountId: customerLedger!._id.toString(),
            debitAmount: 0,
            creditAmount: pd.amount,
            narration: `B2C ${invoiceNo} - ${pd.mode} Payment${cardRefStr}`,
          });
        }
      }
    }

    if (cashLedger && cashPaid > 0) {
      voucherLines.push({
        ledgerAccountId: cashLedger._id.toString(),
        debitAmount: cashPaid,
        creditAmount: 0,
        narration: `B2C ${invoiceNo} - Cash Payment`,
      });
      voucherLines.push({
        ledgerAccountId: customerLedger!._id.toString(),
        debitAmount: 0,
        creditAmount: cashPaid,
        narration: `B2C ${invoiceNo} - Cash Payment`,
      });
    }
  } else {
    // ── CASH customer (no customer A/C) ──
    // Debit: Cash A/C for cash portion
    const cashPortion = grandTotal - cardTotal;
    if (cashLedger && cashPortion > 0) {
      voucherLines.push({
        ledgerAccountId: cashLedger._id.toString(),
        debitAmount: cashPortion,
        creditAmount: 0,
        narration: `B2C ${invoiceNo}`,
      });
    }

    // Debit: Card A/C for card payment
    if (input.paymentDetails && input.paymentDetails.length > 0) {
      for (const pd of input.paymentDetails.filter((p) => !/cash/i.test(p.mode))) {
        if (pd.amount > 0 && pd.accountId) {
          const cardRefStr = pd.reference ? ` (Ref: ${pd.reference})` : '';
          voucherLines.push({
            ledgerAccountId: pd.accountId,
            debitAmount: pd.amount,
            creditAmount: 0,
            narration: `B2C ${invoiceNo} - ${pd.mode}${cardRefStr}`,
          });
        }
      }
    }

    // Credit: Sales A/C with GROSS amount (before discounts)
    if (salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: itemsGross,
        narration: `B2C ${invoiceNo}`,
      });
    }

    // Credit: VAT A/C (total output VAT = items + VAT in adjustments when Vat)
    if (vatLedger && totalVat > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: 0,
        creditAmount: totalVat,
        narration: `B2C ${invoiceNo}`,
      });
    }

    // Discount, Charges & Round-off entries (net amounts when Vat)
    pushSpecialLines();
  }

  console.log(`[B2C ${invoiceNo}] Voucher lines (${voucherLines.length}):`);
  voucherLines.forEach((vl, i) => {
    console.log(`  Line ${i + 1}: ledger=${vl.ledgerAccountId} DR=${vl.debitAmount} CR=${vl.creditAmount} | ${vl.narration}`);
  });

  if (voucherLines.length >= 2) {
    // Safety: adjust for floating-point rounding (should be near zero now)
    const totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = parseFloat((totalDebit - totalCredit).toFixed(2));
    console.log(`[B2C ${invoiceNo}] Total DR=${totalDebit.toFixed(2)}, CR=${totalCredit.toFixed(2)}, diff=${diff}`);
    if (Math.abs(diff) > 0.01 && salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: diff > 0 ? 0 : Math.abs(diff),
        creditAmount: diff > 0 ? diff : 0,
        narration: 'Rounding Adjustment',
      });
    }
    try {
      const v = await voucherService.createAndPost({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        voucherType: 'Sales',
        date: saleDate,
        narration: `B2C Sale ${invoiceNo}`,
        lines: voucherLines,
        referenceType: 'SalesInvoice',
        referenceId: invoice!._id.toString(),
        referenceNo: invoiceNo,
        createdBy: input.createdBy,
      });
      console.log(`[B2C ${invoiceNo}] Voucher created successfully: ${v.voucherNo}`);
      await SalesInvoice.updateOne({ _id: invoice!._id }, { $set: { voucherId: v._id } });
    } catch (e: unknown) {
      console.error(`[B2C ${invoiceNo}] Voucher creation FAILED:`, (e as Error).message || e);
    }
  } else {
    console.warn(`[B2C ${invoiceNo}] Insufficient voucher lines (${voucherLines.length}). Cash ledger: ${cashLedger ? 'found' : 'MISSING'}, Sales ledger: ${salesLedger ? 'found' : 'MISSING'}`);
  }

  // 5. Create bill reference ("New Ref" — receivable from customer and "Agst Ref" for paid amount)
  const billPartyAccountId = input.customerId || (cashLedger ? cashLedger._id.toString() : undefined);
  if (billPartyAccountId && grandTotal > 0) {
    try {
      await billReferenceService.deleteRefsBySource('SalesInvoice', invoice!._id.toString());
      await billReferenceService.createNewRef({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        ledgerAccountId: billPartyAccountId,
        billNumber: invoiceNo,
        referenceType: 'SalesInvoice',
        referenceId: invoice!._id.toString(),
        date: saleDate,
        amount: grandTotal,
        drCr: 'Dr',
        narration: `${type} Sale ${invoiceNo}`,
      });

      if (cashPaid > 0) {
        await billReferenceService.createAgstRef({
          companyId: input.companyId,
          financialYearId: input.financialYearId,
          ledgerAccountId: billPartyAccountId,
          billNumber: invoiceNo,
          referenceType: 'SalesInvoice',
          referenceId: invoice!._id.toString(),
          date: saleDate,
          amount: cashPaid,
          drCr: 'Cr',
          narration: `${type} ${invoiceNo} - Cash Payment`,
        });
      }

      if (cardTotal > 0) {
        const cardRow = effectivePaymentDetails.find((p) => /card/i.test(p.mode));
        const cardRefNote = cardRow?.reference ? ` (Ref: ${cardRow.reference})` : '';
        await billReferenceService.createAgstRef({
          companyId: input.companyId,
          financialYearId: input.financialYearId,
          ledgerAccountId: billPartyAccountId,
          billNumber: invoiceNo,
          referenceType: 'SalesInvoice',
          referenceId: invoice!._id.toString(),
          date: saleDate,
          amount: cardTotal,
          drCr: 'Cr',
          narration: `${type} ${invoiceNo} - Card Payment${cardRefNote}`,
        });
      }
    } catch (err) {
      console.error(`[B2C ${invoiceNo}] Bill reference creation failed:`, err);
    }
  }

  // 6. Submit to Riayati if enabled
  let riayatiSubmissionResult: any = null;
  if (input.isRiayati) {
    riayatiSubmissionResult = await executeRiayatiSubmission({
      companyId: input.companyId,
      invoiceId: invoice!._id,
      invoiceNo: invoice!.invoiceNo,
      visitNumber: input.visitNumber,
      emiratesId: input.emiratesId,
      patientName: input.patientName,
      doctorName: input.doctorName,
      doctorLicenseNo: input.doctorLicenseNo,
      customerPhone: input.customerPhone,
      customerAddress: input.customerAddress,
      date: saleDate,
      items: input.items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        description: it.description,
        batchNumber: it.batchNumber,
        expiryDate: it.expiryDate,
        dosageInstructions: it.dosageInstructions,
        duration: it.duration || it.dosageInstructions?.duration,
        timing: it.timing || it.dosageInstructions?.timing,
        frequency: it.frequency || it.dosageInstructions?.frequency,
      })),
    });
  }

  return {
    invoiceId: invoice!._id.toString(),
    invoiceNo: invoice!.invoiceNo,
    riayatiSubmission: riayatiSubmissionResult,
  };
}

export async function updateB2CSale(
  invoiceId: string,
  companyId: string,
  input: Partial<CreateB2CSaleInput>,
  userId: string
): Promise<{ invoiceId: string; invoiceNo: string; riayatiSubmission?: any } | null> {
  const existing = await SalesInvoice.findOne({ _id: invoiceId, companyId, type: { $in: ['B2C', 'B2B', 'Quotation', 'POS'] } });
  if (!existing) return null;

  // Recalculate with new data
  const company = await Company.findById(companyId);
  if (!company) throw new AppError('Company not found', 404);
  const vatRatePct = input.vatType === 'NonVat' ? 0 : (company.vatConfig?.standardRate ?? 5);
  const saleDate = input.date ? new Date(input.date) : existing.date;

  const items = input.items ?? [];

  // ── Step 1: Validate stock BEFORE deleting old data ──
  // Delete old inventory transactions first to free up stock, then check
  if (existing.type !== 'Quotation') {
    await InventoryTransaction.deleteMany({ referenceId: invoiceId, referenceType: 'SalesInvoice' });
  }

  const usedStockMap = new Map<string, number>();
  for (const item of items) {
    const product = await Product.findById(item.productId).lean();
    if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

    if (existing.type !== 'Quotation') {
      const pid = product._id.toString();
      let requiredStock = item.quantity;
      if (item.multiUnitId && product.multiUnits) {
        const mu = product.multiUnits.find((m) => m.multiUnitId === item.multiUnitId);
        if (mu && mu.conversion && mu.conversion > 0) {
          requiredStock = item.quantity * mu.conversion;
        }
      }

      // Check available stock (old transactions already deleted so stock is freed)
      const stockAgg = await InventoryTransaction.aggregate([
        { $match: { companyId: new mongoose.Types.ObjectId(companyId), productId: product._id } },
        { $group: { _id: null, totalIn: { $sum: '$quantityIn' }, totalOut: { $sum: '$quantityOut' } } },
      ]);
      const totalAvailable = stockAgg.length > 0 ? stockAgg[0].totalIn - stockAgg[0].totalOut : 0;
      const alreadyUsed = usedStockMap.get(pid) ?? 0;
      const remainingStock = totalAvailable - alreadyUsed;

      if (remainingStock < requiredStock) {
        // Restore old inventory transactions since validation failed
        // Re-create old items from DB — we haven't deleted SalesInvoiceItems yet
        throw new AppError(
          `Insufficient stock for "${product.name}". Available: ${remainingStock}, Required: ${requiredStock}`,
          400
        );
      }
      usedStockMap.set(pid, alreadyUsed + requiredStock);
    }
  }

  // ── Step 2: Now safe to delete old items and recreate ──
  await SalesInvoiceItem.deleteMany({ invoiceId });

  let itemsGross = 0, itemsDiscount = 0, itemsVat = 0;

  const taxModeUpdate = input.taxMode ?? 'exclusive';

  for (const item of items) {
    const product = await Product.findById(item.productId).lean();
    if (!product) continue;

    const qty = item.quantity;
    const price = item.unitPrice;
    const gross = qty * price;
    const discPct = item.discountPercent ?? 0;
    const disc = item.discount ?? (gross * discPct / 100);
    const net = gross - disc;
    const vatRate = input.vatType === 'NonVat' ? 0 : (item.vatRate ?? vatRatePct);
    let vatAmt: number;
    let total: number;
    if (input.vatType === 'Vat' && taxModeUpdate === 'inclusive' && vatRate > 0) {
      vatAmt = parseFloat((net * vatRate / (100 + vatRate)).toFixed(2));
      total = parseFloat(net.toFixed(2));
    } else {
      vatAmt = parseFloat((net * (vatRate / 100)).toFixed(2));
      total = parseFloat((net + vatAmt).toFixed(2));
    }

    itemsGross += gross;
    itemsDiscount += disc;
    itemsVat += vatAmt;

    await SalesInvoiceItem.create({
      invoiceId: existing._id,
      productId: product._id,
      productCode: item.productCode ?? product.code ?? '',
      imei: item.imei ?? product.imei ?? '',
      multiUnitId: item.multiUnitId,
      unitId: item.unitId,
      unitName: item.unitName,
      description: item.description ?? product.name,
      quantity: qty,
      unitPrice: price,
      grossAmount: gross,
      discountPercent: discPct,
      discount: disc,
      netAmount: net,
      vatRate,
      vatAmount: vatAmt,
      totalAmount: total,
      costPriceAtSale: product.purchasePrice ?? 0,
      batchNumber: item.batchNumber,
    });

    if (existing.type !== 'Quotation') {
      // For multi-unit sales, reduce stock by conversion (pcs inside) instead of line qty
      let stockQtyOut = qty;
      if (item.multiUnitId && product.multiUnits) {
        const mu = product.multiUnits.find((m) => m.multiUnitId === item.multiUnitId);
        if (mu && mu.conversion && mu.conversion > 0) {
          stockQtyOut = qty * mu.conversion;
        }
      }

      await InventoryTransaction.create({
        companyId,
        financialYearId: input.financialYearId ?? existing.financialYearId.toString(),
        productId: product._id,
        date: saleDate,
        type: 'Sales',
        quantityIn: 0,
        quantityOut: stockQtyOut,
        costPrice: product.purchasePrice ?? 0,
        referenceType: 'SalesInvoice',
        referenceId: existing._id,
        batchNumber: item.batchNumber || undefined,
        createdBy: userId,
      });
    }
  }

  const otherDiscount = input.otherDiscount ?? existing.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? existing.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? existing.freightCharge ?? 0;
  const lendAddLess = input.lendAddLess ?? existing.lendAddLess ?? 0;
  const roundOff = input.roundOff ?? existing.roundOff ?? 0;

  // When Vat: adjustments are inclusive — totalVat and net amounts for ledgers
  const isVatUpdate = input.vatType !== 'NonVat';
  const netAdjustmentsUpdate = otherCharges + freightCharge + lendAddLess + roundOff - otherDiscount;
  const vatFromAdjustmentsUpdate = isVatUpdate && netAdjustmentsUpdate !== 0
    ? parseFloat((netAdjustmentsUpdate * vatRatePct / (100 + vatRatePct)).toFixed(2))
    : 0;
  const totalVatUpdate = parseFloat((itemsVat + vatFromAdjustmentsUpdate).toFixed(2));
  const netFactorUpdate = isVatUpdate ? 100 / (100 + vatRatePct) : 1;
  const otherDiscountNetUpdate = parseFloat((otherDiscount * netFactorUpdate).toFixed(2));
  const otherChargesNetUpdate = parseFloat((otherCharges * netFactorUpdate).toFixed(2));
  const freightChargeNetUpdate = parseFloat((freightCharge * netFactorUpdate).toFixed(2));
  const lendAddLessNetUpdate = parseFloat((lendAddLess * netFactorUpdate).toFixed(2));
  const roundOffNetUpdate = parseFloat((roundOff * netFactorUpdate).toFixed(2));

  const taxableAmount = itemsGross - itemsDiscount;
  const subTotalUpdate = (input.taxMode === 'inclusive' && isVatUpdate) ? taxableAmount : (taxableAmount + itemsVat);
  const grandTotal = subTotalUpdate - otherDiscount + otherCharges + freightCharge + lendAddLess + roundOff;
  const cardTotal = (input.paymentDetails ?? []).filter((pd) => /card/i.test(pd.mode)).reduce((s, pd) => s + (pd.amount || 0), 0);
  const isCredit = input.paymentType === 'Credit';
  const cashPaid = input.cashReceived !== undefined && input.cashReceived > 0
    ? Math.min(input.cashReceived, Math.max(0, grandTotal - cardTotal))
    : (isCredit ? 0 : Math.max(0, grandTotal - cardTotal));
  const totalPaid = cardTotal + cashPaid;
  const cashReceived = input.cashReceived !== undefined
    ? input.cashReceived
    : (isCredit ? 0 : Math.max(0, grandTotal - cardTotal));
  const balance = grandTotal - totalPaid;

  // Synthesize paymentDetails to guarantee both cash and card details are stored
  const effectivePaymentDetails = [...(input.paymentDetails ?? [])];
  const hasCashRow = effectivePaymentDetails.some((pd) => /cash/i.test(pd.mode));
  if (!hasCashRow && cashPaid > 0) {
    effectivePaymentDetails.unshift({
      mode: 'Cash',
      amount: cashPaid,
      accountId: input.cashAccountId as any,
    });
  }

  // Delete old voucher if exists
  if (existing.voucherId) {
    try {
      await Voucher.deleteOne({ _id: existing.voucherId });
      // Also delete ledger entries for the old voucher
      const { LedgerEntry } = await import('../models/LedgerEntry');
      await LedgerEntry.deleteMany({ voucherId: existing.voucherId });
    } catch {
      // ignore
    }
  }

  await SalesInvoice.updateOne(
    { _id: invoiceId },
    {
      $set: {
        date: saleDate,
        customerId: input.customerId,
        customerName: input.customerName,
        customerAddress: input.customerAddress,
        customerPhone: input.customerPhone,
        salesmanId: input.salesmanId,
        rateType: input.rateType,
        paymentType: input.paymentType,
        vatType: input.vatType,
        cashAccountId: input.cashAccountId,
        grossAmount: itemsGross,
        discountAmount: itemsDiscount,
        taxableAmount,
        vatAmount: totalVatUpdate,
        otherDiscount,
        otherCharges,
        freightCharge,
        lendAddLess,
        roundOff,
        totalAmount: grandTotal,
        cashReceived,
        balance,
        oldBalance: input.oldBalance ?? existing.oldBalance ?? 0,
        netBalance: balance + (input.oldBalance ?? existing.oldBalance ?? 0),
        paymentDetails: effectivePaymentDetails,
        narration: input.narration,
        // Shipping details
        shippingName: input.shippingName,
        shippingAddress: input.shippingAddress,
        shippingPhone: input.shippingPhone,
        shippingContactPerson: input.shippingContactPerson,
        patientName: input.patientName,
        doctorName: input.doctorName,
        doctorLicenseNo: input.doctorLicenseNo,
        emiratesId: input.emiratesId,
        prescriptionNumber: input.prescriptionNumber,
        prescriptionDate: input.prescriptionDate,
        isRiayati: input.isRiayati !== undefined ? input.isRiayati : existing.isRiayati,
        updatedBy: userId,
      },
    }
  );

  if (existing.type === 'Quotation') {
    return { invoiceId, invoiceNo: existing.invoiceNo };
  }

  // ── Recreate accounting entries (totalVat + net adjustment amounts when Vat) ─────────────────────────────────────
  const cashLedger = input.cashAccountId
    ? await LedgerAccount.findById(input.cashAccountId)
    : await LedgerAccount.findOne({ companyId, type: 'Cash' });
  const salesLedger = await findOrCreateSalesLedger(companyId);
  const vatLedger = await findOrCreateVatLedger(companyId);
  const customerLedger = input.customerId ? await LedgerAccount.findById(input.customerId) : null;
  let defaultCardLedger = null;
  if (cardTotal > 0) {
    defaultCardLedger = await LedgerAccount.findOne({
      companyId,
      $or: [{ isCardAccount: true }, { name: /card\s*clearing/i }, { name: /card/i }],
    });
    if (!defaultCardLedger) {
      defaultCardLedger = await LedgerAccount.findOne({ companyId, type: 'Bank' });
    }
  }

  // Look up special ledger accounts (only when the amount is non-zero)
  const discountOnSalesLedger2 = itemsDiscount > 0
    ? await findOrCreateSpecialLedger(companyId, 'Discount on Sales', 'Expense', 'Expense') : null;
  const otherDiscountLedger2 = otherDiscount > 0
    ? await findOrCreateSpecialLedger(companyId, 'Other Discount on Sales', 'Expense', 'Expense') : null;
  const otherChargesLedger2 = otherCharges > 0
    ? await findOrCreateSpecialLedger(companyId, 'Other Charges on Sales', 'Revenue', 'Income') : null;
  const freightChargesLedger2 = freightCharge > 0
    ? await findOrCreateSpecialLedger(companyId, 'Freight Charges on Sales', 'Revenue', 'Income') : null;
  const travelChargesLedger2 = lendAddLess > 0
    ? await findOrCreateSpecialLedger(companyId, 'Travel Charges on Sales', 'Revenue', 'Income') : null;
  const roundOffLedger2 = Math.abs(roundOff) > 0.001
    ? await findOrCreateSpecialLedger(companyId, 'Round Off on Sales', 'Expense', 'Expense') : null;

  const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];

  /** Helper: push the shared credit/debit lines for discounts, charges, round-off (net amounts when Vat) */
  const pushSpecialLines2 = () => {
    if (discountOnSalesLedger2 && itemsDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: discountOnSalesLedger2._id.toString(),
        debitAmount: itemsDiscount, creditAmount: 0,
        narration: `B2C ${invNo} - Row Discounts`,
      });
    }
    if (otherDiscountLedger2 && otherDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: otherDiscountLedger2._id.toString(),
        debitAmount: otherDiscountNetUpdate, creditAmount: 0,
        narration: `B2C ${invNo} - Other Discount`,
      });
    }
    if (otherChargesLedger2 && otherCharges > 0) {
      voucherLines.push({
        ledgerAccountId: otherChargesLedger2._id.toString(),
        debitAmount: 0, creditAmount: otherChargesNetUpdate,
        narration: `B2C ${invNo} - Other Charges`,
      });
    }
    if (freightChargesLedger2 && freightCharge > 0) {
      voucherLines.push({
        ledgerAccountId: freightChargesLedger2._id.toString(),
        debitAmount: 0, creditAmount: freightChargeNetUpdate,
        narration: `B2C ${invNo} - Freight Charges`,
      });
    }
    if (travelChargesLedger2 && lendAddLess > 0) {
      voucherLines.push({
        ledgerAccountId: travelChargesLedger2._id.toString(),
        debitAmount: 0, creditAmount: lendAddLessNetUpdate,
        narration: `B2C ${invNo} - Travel Charges`,
      });
    }
    if (roundOffLedger2 && Math.abs(roundOff) > 0.001) {
      voucherLines.push({
        ledgerAccountId: roundOffLedger2._id.toString(),
        debitAmount: roundOffNetUpdate < 0 ? Math.abs(roundOffNetUpdate) : 0,
        creditAmount: roundOffNetUpdate > 0 ? roundOffNetUpdate : 0,
        narration: `B2C ${invNo} - Round Off`,
      });
    }
  };

  const hasCustomerAc = !!customerLedger;
  const isCashPayment = input.paymentType !== 'Credit';
  const invNo = existing.invoiceNo;

  if (hasCustomerAc) {
    // ── Customer A/C selected ──
    voucherLines.push({
      ledgerAccountId: customerLedger!._id.toString(),
      debitAmount: grandTotal,
      creditAmount: 0,
      narration: `B2C ${invNo} - Sale`,
    });

    // Credit: Sales A/C with GROSS amount (before discounts)
    if (salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: itemsGross,
        narration: `B2C ${invNo}`,
      });
    }

    // Credit: VAT A/C (total output VAT when Vat)
    if (vatLedger && totalVatUpdate > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: 0,
        creditAmount: totalVatUpdate,
        narration: `B2C ${invNo}`,
      });
    }

    // Discount, Charges & Round-off entries (net when Vat)
    pushSpecialLines2();

    // Step 2: Payment entries — settle customer account for any amount paid (Card / Cash)
    if (input.paymentDetails && input.paymentDetails.length > 0) {
      for (const pd of input.paymentDetails.filter((p) => !/cash/i.test(p.mode))) {
        const accId = pd.accountId || defaultCardLedger?._id.toString();
        if (pd.amount > 0 && accId) {
          const cardRefStr = pd.reference ? ` (Ref: ${pd.reference})` : '';
          voucherLines.push({
            ledgerAccountId: accId,
            debitAmount: pd.amount,
            creditAmount: 0,
            narration: `B2C ${invNo} - ${pd.mode} Payment${cardRefStr}`,
          });
          voucherLines.push({
            ledgerAccountId: customerLedger!._id.toString(),
            debitAmount: 0,
            creditAmount: pd.amount,
            narration: `B2C ${invNo} - ${pd.mode} Payment${cardRefStr}`,
          });
        }
      }
    }

    if (cashLedger && cashPaid > 0) {
      voucherLines.push({
        ledgerAccountId: cashLedger._id.toString(),
        debitAmount: cashPaid,
        creditAmount: 0,
        narration: `B2C ${invNo} - Cash Payment`,
      });
      voucherLines.push({
        ledgerAccountId: customerLedger!._id.toString(),
        debitAmount: 0,
        creditAmount: cashPaid,
        narration: `B2C ${invNo} - Cash Payment`,
      });
    }
  } else {
    // ── CASH customer (no customer A/C) ──
    const cashPortion = grandTotal - cardTotal;
    if (cashLedger && cashPortion > 0) {
      voucherLines.push({
        ledgerAccountId: cashLedger._id.toString(),
        debitAmount: cashPortion,
        creditAmount: 0,
        narration: `B2C ${invNo}`,
      });
    }

    if (input.paymentDetails && input.paymentDetails.length > 0) {
      for (const pd of input.paymentDetails.filter((p) => !/cash/i.test(p.mode))) {
        if (pd.amount > 0 && pd.accountId) {
          const cardRefStr = pd.reference ? ` (Ref: ${pd.reference})` : '';
          voucherLines.push({
            ledgerAccountId: pd.accountId,
            debitAmount: pd.amount,
            creditAmount: 0,
            narration: `B2C ${invNo} - ${pd.mode}${cardRefStr}`,
          });
        }
      }
    }

    // Credit: Sales A/C with GROSS amount (before discounts)
    if (salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: itemsGross,
        narration: `B2C ${invNo}`,
      });
    }

    if (vatLedger && totalVatUpdate > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: 0,
        creditAmount: totalVatUpdate,
        narration: `B2C ${invNo}`,
      });
    }

    // Discount, Charges & Round-off entries (net when Vat)
    pushSpecialLines2();
  }

  if (voucherLines.length >= 2) {
    const totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = parseFloat((totalDebit - totalCredit).toFixed(2));
    if (Math.abs(diff) > 0.01 && salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: diff > 0 ? 0 : Math.abs(diff),
        creditAmount: diff > 0 ? diff : 0,
        narration: 'Rounding Adjustment',
      });
    }
    try {
      const v = await voucherService.createAndPost({
        companyId,
        financialYearId: input.financialYearId ?? existing.financialYearId.toString(),
        voucherType: 'Sales',
        date: saleDate,
        narration: `B2C Sale ${invNo}`,
        lines: voucherLines,
        referenceType: 'SalesInvoice',
        referenceId: invoiceId,
        referenceNo: invNo,
        createdBy: userId,
      });
      await SalesInvoice.updateOne({ _id: invoiceId }, { $set: { voucherId: v._id } });
    } catch (e: unknown) {
      console.error(`[B2C ${invNo} update] Voucher creation failed:`, (e as Error).message || e);
    }
  } else {
    console.warn(`[B2C ${invNo} update] Insufficient voucher lines (${voucherLines.length}). Cash: ${cashLedger ? 'found' : 'MISSING'}, Sales: ${salesLedger ? 'found' : 'MISSING'}`);
  }

  // Update bill reference ("New Ref" — receivable from customer and "Agst Ref" for paid amount)
  const billPartyAccountId = input.customerId || (cashLedger ? cashLedger._id.toString() : undefined);
  if (billPartyAccountId && grandTotal > 0) {
    try {
      await billReferenceService.deleteRefsBySource('SalesInvoice', invoiceId);
      await billReferenceService.createNewRef({
        companyId,
        financialYearId: input.financialYearId ?? existing.financialYearId.toString(),
        ledgerAccountId: billPartyAccountId,
        billNumber: existing.invoiceNo,
        referenceType: 'SalesInvoice',
        referenceId: invoiceId,
        date: saleDate,
        amount: grandTotal,
        drCr: 'Dr',
        narration: `${existing.type || 'B2C'} Sale ${existing.invoiceNo} (updated)`,
      });

      if (cashPaid > 0) {
        await billReferenceService.createAgstRef({
          companyId,
          financialYearId: input.financialYearId ?? existing.financialYearId.toString(),
          ledgerAccountId: billPartyAccountId,
          billNumber: existing.invoiceNo,
          referenceType: 'SalesInvoice',
          referenceId: invoiceId,
          date: saleDate,
          amount: cashPaid,
          drCr: 'Cr',
          narration: `${existing.type || 'B2C'} ${existing.invoiceNo} - Cash Payment`,
        });
      }

      if (cardTotal > 0) {
        const cardRow = effectivePaymentDetails.find((p) => /card/i.test(p.mode));
        const cardRefNote = cardRow?.reference ? ` (Ref: ${cardRow.reference})` : '';
        await billReferenceService.createAgstRef({
          companyId,
          financialYearId: input.financialYearId ?? existing.financialYearId.toString(),
          ledgerAccountId: billPartyAccountId,
          billNumber: existing.invoiceNo,
          referenceType: 'SalesInvoice',
          referenceId: invoiceId,
          date: saleDate,
          amount: cardTotal,
          drCr: 'Cr',
          narration: `${existing.type || 'B2C'} ${existing.invoiceNo} - Card Payment${cardRefNote}`,
        });
      }
    } catch (err) {
      console.error(`[B2C ${invNo} update] Bill reference update failed:`, err);
    }
  }

  // Re-submit to Riayati if enabled
  let riayatiSubmissionResult: any = null;
  if (input.isRiayati) {
    riayatiSubmissionResult = await executeRiayatiSubmission({
      companyId,
      invoiceId,
      invoiceNo: existing.invoiceNo,
      visitNumber: input.visitNumber,
      emiratesId: input.emiratesId,
      patientName: input.patientName,
      doctorName: input.doctorName,
      doctorLicenseNo: input.doctorLicenseNo,
      customerPhone: input.customerPhone,
      customerAddress: input.customerAddress,
      date: saleDate,
      items: items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        description: it.description,
        batchNumber: it.batchNumber,
        expiryDate: it.expiryDate,
        dosageInstructions: it.dosageInstructions,
        duration: it.duration || it.dosageInstructions?.duration,
        timing: it.timing || it.dosageInstructions?.timing,
        frequency: it.frequency || it.dosageInstructions?.frequency,
      })),
    });
  }

  return { invoiceId, invoiceNo: existing.invoiceNo, riayatiSubmission: riayatiSubmissionResult };
}

export async function deleteB2CSale(invoiceId: string, companyId: string): Promise<boolean> {
  const invoice = await SalesInvoice.findOne({ _id: invoiceId, companyId, type: { $in: ['B2C', 'B2B', 'Quotation', 'POS'] } });
  if (!invoice) return false;

  // Delete line items
  await SalesInvoiceItem.deleteMany({ invoiceId });

  // Reverse inventory transactions
  await InventoryTransaction.deleteMany({ referenceId: invoiceId, referenceType: 'SalesInvoice' });

  // Reverse accounting entries - delete voucher and associated ledger entries
  if (invoice.voucherId) {
    try {
      const { LedgerEntry } = await import('../models/LedgerEntry');
      await LedgerEntry.deleteMany({ voucherId: invoice.voucherId });
      await Voucher.deleteOne({ _id: invoice.voucherId });
    } catch (e) {
      console.error(`[B2C Delete] Failed to reverse accounting entries for voucher ${invoice.voucherId}:`, (e as Error).message || e);
    }
  }

  // Delete bill references
  await billReferenceService.deleteRefsBySource('SalesInvoice', invoiceId);

  await SalesInvoice.deleteOne({ _id: invoiceId });

  return true;
}

export async function listB2CInvoices(
  companyId: string,
  financialYearId: string,
  opts: { search?: string; fromDate?: string; toDate?: string; page?: number; limit?: number; type?: 'B2C' | 'B2B' | 'Quotation' | 'POS'; idsOnly?: boolean } = {}
) {
  const type = opts.type || 'B2C';
  const filter: Record<string, unknown> = { companyId, financialYearId, type };

  if (opts.search) {
    filter.$or = [
      { invoiceNo: new RegExp(opts.search, 'i') },
      { customerName: new RegExp(opts.search, 'i') },
    ];
  }
  if (opts.fromDate || opts.toDate) {
    filter.date = {};
    if (opts.fromDate) (filter.date as Record<string, Date>).$gte = new Date(opts.fromDate);
    if (opts.toDate) (filter.date as Record<string, Date>).$lte = new Date(opts.toDate);
  }

  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 10000);

  // Invoice navigation only needs the ordered ids — skip the count and document payload
  if (opts.idsOnly) {
    const invoices = await SalesInvoice.find(filter)
      .select('_id')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    return { invoices, total: invoices.length };
  }

  const total = await SalesInvoice.countDocuments(filter);
  const invoices = await SalesInvoice.find(filter)
    .populate('customerId', 'name code')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return { invoices, total };
}

export async function getB2CInvoice(
  invoiceId: string,
  companyId: string,
  type?: 'B2C' | 'B2B' | 'Quotation' | 'POS',
  excludeReturnId?: string
) {
  let invoice: any = null;
  const isObjectId = mongoose.Types.ObjectId.isValid(invoiceId);

  if (isObjectId) {
    if (type) {
      invoice = await SalesInvoice.findOne({ _id: invoiceId, companyId, type })
        .populate('customerId', 'name code address')
        .populate('salesmanId', 'username displayName')
        .populate('cashAccountId', 'name code')
        .lean();
    }
    if (!invoice) {
      invoice = await SalesInvoice.findOne({ _id: invoiceId, companyId })
        .populate('customerId', 'name code address')
        .populate('salesmanId', 'username displayName')
        .populate('cashAccountId', 'name code')
        .lean();
    }
    if (!invoice) {
      invoice = await SalesInvoice.findOne({ voucherId: new mongoose.Types.ObjectId(invoiceId), companyId })
        .populate('customerId', 'name code address')
        .populate('salesmanId', 'username displayName')
        .populate('cashAccountId', 'name code')
        .lean();
    }
  }

  if (!invoice) {
    invoice = await SalesInvoice.findOne({ invoiceNo: invoiceId, companyId })
      .populate('customerId', 'name code address')
      .populate('salesmanId', 'username displayName')
      .populate('cashAccountId', 'name code')
      .lean();
  }

  if (!invoice) return null;

  const items = await SalesInvoiceItem.find({ invoiceId: invoice._id })
    .populate({
      path: 'productId',
      select: 'name code imei sku retailPrice wholesalePrice purchasePrice unitOfMeasureId multiUnits',
      populate: [
        { path: 'unitOfMeasureId', select: 'name shortCode' },
        { path: 'multiUnits.unitId', select: 'name shortCode' }
      ]
    })
    .lean();

  const returnFilter: Record<string, any> = {
    companyId,
    type: 'Return',
    status: { $ne: 'Cancelled' },
    originalInvoiceId: invoice._id,
  };
  if (excludeReturnId) {
    returnFilter._id = { $ne: new mongoose.Types.ObjectId(excludeReturnId) };
  }
  const returns = await SalesInvoice.find(returnFilter).select('_id').lean();

  const returnedQuantities: Record<string, number> = {};
  if (returns.length > 0) {
    const returnIds = returns.map((r) => r._id);
    const returnItems = await SalesInvoiceItem.find({ invoiceId: { $in: returnIds } }).lean();
    for (const ri of returnItems) {
      const pId = ri.productId ? ri.productId.toString() : '';
      const key = `${pId}_${ri.batchNumber || ''}`;
      returnedQuantities[key] = (returnedQuantities[key] || 0) + (ri.quantity || 0);
    }
  }

  const remainingToAllocate = { ...returnedQuantities };
  const itemsWithReturned = items.map((it) => {
    const pId = typeof it.productId === 'object' && it.productId !== null
      ? (it.productId as any)._id.toString()
      : String(it.productId || '');
    const key = `${pId}_${it.batchNumber || ''}`;
    const totalReturnedForThisKey = remainingToAllocate[key] || 0;
    const allocatedToLine = Math.min(it.quantity || 0, totalReturnedForThisKey);
    if (remainingToAllocate[key] !== undefined) {
      remainingToAllocate[key] -= allocatedToLine;
    }
    return {
      ...it,
      returnedQuantity: allocatedToLine,
      remainingReturnableQuantity: Math.max(0, (it.quantity || 0) - allocatedToLine),
    };
  });

  return { ...invoice, items: itemsWithReturned };
}

export async function searchB2CByInvoiceNo(
  companyId: string,
  invoiceNo: string,
  type?: 'B2C' | 'B2B' | 'Quotation' | 'POS',
  excludeReturnId?: string
) {
  const filter: Record<string, any> = {
    companyId,
    invoiceNo: new RegExp(`^${invoiceNo}$`, 'i'),
  };
  if (type) filter.type = type;
  else filter.type = { $in: ['B2C', 'B2B', 'Quotation', 'POS'] };

  let invoice = await SalesInvoice.findOne(filter).lean();
  if (!invoice && type) {
    invoice = await SalesInvoice.findOne({ companyId, invoiceNo: new RegExp(`^${invoiceNo}$`, 'i') }).lean();
  }
  if (!invoice) {
    // Substring fallback
    invoice = await SalesInvoice.findOne({ companyId, invoiceNo: new RegExp(invoiceNo, 'i') }).lean();
  }
  if (!invoice) return null;
  return getB2CInvoice(invoice._id.toString(), companyId, invoice.type as 'B2C' | 'B2B' | 'Quotation' | 'POS', excludeReturnId);
}


/**
 * Get transaction history for a product sold to a specific customer.
 * Returns all B2C invoice items for the given product + customer.
 */
export async function getProductCustomerHistory(
  companyId: string,
  productId: string,
  customerId?: string,
  type?: 'POS' | 'B2C' | 'B2B' | 'Quotation'
) {
  const productObjId = new mongoose.Types.ObjectId(productId);

  // Build the SALES invoice filter (purchases)
  const salesFilter: Record<string, any> = {
    companyId,
    type: type || { $in: ['POS', 'B2C', 'B2B', 'Quotation'] },
    status: { $ne: 'Cancelled' },
  };

  // Build the RETURN invoice filter (previous returns by this customer)
  const returnFilter: Record<string, any> = {
    companyId,
    type: 'Return',
    status: { $ne: 'Cancelled' },
  };

  if (customerId) {
    let isCashAccount = false;
    if (customerId === 'cash') {
      isCashAccount = true;
    } else if (mongoose.Types.ObjectId.isValid(customerId)) {
      const account = await LedgerAccount.findById(customerId).lean();
      if (account && (account.type === 'Cash' || account.type === 'Bank' || account.name.toLowerCase() === 'cash' || account.code.toLowerCase() === 'cash')) {
        isCashAccount = true;
      }
    }

    if (isCashAccount) {
      const cashConditions = [
        { cashAccountId: new mongoose.Types.ObjectId(customerId) },
        { paymentType: 'Cash', customerId: null },
        { paymentType: 'Cash', customerId: { $exists: false } }
      ];
      salesFilter.$or = cashConditions;
      returnFilter.$or = cashConditions;
    } else {
      salesFilter.customerId = new mongoose.Types.ObjectId(customerId);
      returnFilter.customerId = new mongoose.Types.ObjectId(customerId);
    }
  }

  // Query sales invoices and return invoices in parallel
  const [salesInvoices, returnInvoices] = await Promise.all([
    SalesInvoice.find(salesFilter)
      .select('_id invoiceNo date customerName totalAmount')
      .sort({ date: -1, createdAt: -1 })
      .lean(),
    SalesInvoice.find(returnFilter)
      .select('_id')
      .lean(),
  ]);

  // ── Calculate totalPurchased ──
  let totalPurchased = 0;
  let history: Array<{
    invoiceNo: string; date: string | Date; customerName: string;
    quantity: number; unitPrice: number; unitName: string;
    discount: number; total: number; batchNumber: string;
  }> = [];

  if (salesInvoices.length > 0) {
    const salesIds = salesInvoices.map((inv) => inv._id);
    const salesItems = await SalesInvoiceItem.find({
      invoiceId: { $in: salesIds },
      productId: productObjId,
    }).lean();

    totalPurchased = salesItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

    const invoiceMap = new Map(salesInvoices.map((inv) => [inv._id.toString(), inv]));
    history = salesItems.map((item) => {
      const inv = invoiceMap.get(item.invoiceId.toString());
      return {
        invoiceNo: inv?.invoiceNo || '',
        date: inv?.date || '',
        customerName: inv?.customerName || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitName: item.unitName || '',
        discount: item.discount,
        total: item.totalAmount,
        batchNumber: item.batchNumber || '',
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // ── Calculate totalReturned (from previous return invoices) ──
  let totalReturned = 0;
  if (returnInvoices.length > 0) {
    const returnIds = returnInvoices.map((inv) => inv._id);
    const returnItems = await SalesInvoiceItem.find({
      invoiceId: { $in: returnIds },
      productId: productObjId,
    }).lean();

    totalReturned = returnItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }

  const netReturnable = Math.max(0, totalPurchased - totalReturned);

  return {
    history: history.slice(0, 20), // return recent history for display (increased from 5)
    totalPurchased,
    totalReturned,
    netReturnable,
  };
}

// ─── Sales Return ────────────────────────────────────────────────────

export type SalesReturnType = 'OnAccount' | 'ByRef';

export interface SalesReturnLineItem {
  productId: string;
  productCode?: string;
  imei?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discount?: number;
  unitId?: string;
  unitName?: string;
  multiUnitId?: string;
  batchNumber?: string;
}

export interface CreateSalesReturnInput {
  companyId: string;
  financialYearId: string;
  date?: string;
  returnType: SalesReturnType;
  originalInvoiceId?: string; // required when returnType === 'ByRef'
  customerId?: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  cashAccountId?: string; // for cash refund
  vatType?: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  items: SalesReturnLineItem[];
  otherDiscount?: number;
  otherCharges?: number;
  freightCharge?: number;
  lendAddLess?: number;
  roundOff?: number;
  narration?: string;
  createdBy?: string;
}

export async function getNextReturnInvoiceNo(companyId: string, financialYearId: string): Promise<string> {
  const prefix = 'SR';
  const last = await SalesInvoice.findOne({ companyId, financialYearId, type: 'Return' })
    .sort({ invoiceNo: -1 })
    .lean();
  if (!last?.invoiceNo) return `${prefix}-000001`;
  const match = last.invoiceNo.match(/-(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${num.toString().padStart(6, '0')}`;
}

export async function listSalesReturns(companyId: string, financialYearId: string) {
  const invoices = await SalesInvoice.find({ companyId, financialYearId, type: 'Return' })
    .sort({ date: 1, createdAt: 1 })
    .limit(500)
    .lean();
  return invoices.map((inv) => ({
    _id: inv._id.toString(),
    invoiceNo: inv.invoiceNo,
    date: inv.date,
    customerName: inv.customerName,
    totalAmount: inv.totalAmount,
  }));
}

export async function createSalesReturn(input: CreateSalesReturnInput): Promise<{ invoiceId: string; invoiceNo: string }> {
  const company = await Company.findById(input.companyId);
  if (!company) throw new AppError('Company not found', 404);
  if (input.returnType === 'ByRef' && !input.originalInvoiceId) {
    throw new AppError('Original invoice is required when return type is By Ref', 400);
  }

  const vatRatePct = input.vatType === 'NonVat' ? 0 : (company.vatConfig?.standardRate ?? 5);
  const returnDate = input.date ? new Date(input.date) : new Date();

  let itemsGross = 0;
  let itemsDiscount = 0;
  let itemsVat = 0;

  const lineItems: Array<{
    productId: mongoose.Types.ObjectId;
    productCode: string;
    imei?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    grossAmount: number;
    discountPercent: number;
    discount: number;
    netAmount: number;
    vatRate: number;
    vatAmount: number;
    totalAmount: number;
    costPriceAtSale: number;
    unitId?: string;
    unitName?: string;
    multiUnitId?: string;
    batchNumber?: string;
  }> = [];

  // Merge items with same product + same batch into one line (add to last batch, don't create another)
  const mergedItems: typeof input.items = [];
  const keyToIndex = new Map<string, number>();
  for (const item of input.items) {
    const key = `${item.productId}|${item.batchNumber ?? ''}`;
    const existing = keyToIndex.get(key);
    if (existing !== undefined) {
      mergedItems[existing] = {
        ...mergedItems[existing],
        quantity: (mergedItems[existing].quantity ?? 0) + (item.quantity ?? 0),
        discount: (mergedItems[existing].discount ?? 0) + (item.discount ?? 0),
      };
    } else {
      keyToIndex.set(key, mergedItems.length);
      mergedItems.push({ ...item });
    }
  }

  let originalInvoiceNo: string | undefined;
  if (input.returnType === 'ByRef' && input.originalInvoiceId) {
    const originalInvoice = await SalesInvoice.findOne({ _id: input.originalInvoiceId, companyId: input.companyId }).lean();
    if (!originalInvoice) {
      throw new AppError('Original invoice not found', 404);
    }
    originalInvoiceNo = originalInvoice.invoiceNo;
    const originalItems = await SalesInvoiceItem.find({ invoiceId: originalInvoice._id }).lean();
    
    // Find all returns against this invoice
    const otherReturns = await SalesInvoice.find({
      companyId: input.companyId,
      type: 'Return',
      status: { $ne: 'Cancelled' },
      originalInvoiceId: originalInvoice._id,
    }).select('_id').lean();

    const returnedQuantities: Record<string, number> = {};
    if (otherReturns.length > 0) {
      const returnIds = otherReturns.map((r) => r._id);
      const returnItems = await SalesInvoiceItem.find({ invoiceId: { $in: returnIds } }).lean();
      for (const ri of returnItems) {
        const pId = ri.productId ? ri.productId.toString() : '';
        const key = `${pId}_${ri.batchNumber || ''}`;
        returnedQuantities[key] = (returnedQuantities[key] || 0) + (ri.quantity || 0);
      }
    }

    for (const item of mergedItems) {
      const matchingOriginalItems = originalItems.filter(
        (oi) =>
          oi.productId.toString() === item.productId.toString() &&
          (item.batchNumber ? oi.batchNumber === item.batchNumber : true)
      );
      if (matchingOriginalItems.length === 0) {
        throw new AppError(`Item "${item.description || 'Unknown'}" was not purchased in the referenced invoice.`, 400);
      }
      
      const totalPurchasedQty = matchingOriginalItems.reduce((sum, oi) => sum + (oi.quantity || 0), 0);
      
      let prevReturned = 0;
      if (item.batchNumber) {
        const key = `${item.productId}_${item.batchNumber}`;
        prevReturned = returnedQuantities[key] || 0;
      } else {
        const prefix = `${item.productId}_`;
        for (const [k, qty] of Object.entries(returnedQuantities)) {
          if (k.startsWith(prefix)) {
            prevReturned += qty;
          }
        }
      }
      
      const remaining = Math.max(0, totalPurchasedQty - prevReturned);

      if (item.quantity > remaining) {
        const desc = matchingOriginalItems[0].description || item.description || 'Unknown';
        throw new AppError(
          `Cannot return ${item.quantity} units of "${desc}". Only ${remaining} units are returnable (purchased: ${totalPurchasedQty}, already returned: ${prevReturned}).`,
          400
        );
      }
    }
  }

  for (const item of mergedItems) {
    const product = await Product.findById(item.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${item.productId}`, 404);
    }
    const qty = item.quantity;
    const price = item.unitPrice;
    const gross = qty * price;
    const discPct = item.discountPercent ?? 0;
    const disc = item.discount ?? (gross * discPct / 100);
    const net = gross - disc;
    const vatRate = input.vatType === 'NonVat' ? 0 : (vatRatePct);
    const taxMode = input.taxMode ?? 'exclusive';
    let vatAmt: number;
    let total: number;
    if (input.vatType === 'Vat' && taxMode === 'inclusive' && vatRate > 0) {
      vatAmt = parseFloat((net * vatRate / (100 + vatRate)).toFixed(2));
      total = parseFloat(net.toFixed(2));
    } else {
      vatAmt = parseFloat((net * (vatRate / 100)).toFixed(2));
      total = parseFloat((net + vatAmt).toFixed(2));
    }
    itemsGross += gross;
    itemsDiscount += disc;
    itemsVat += vatAmt;

    lineItems.push({
      productId: product._id,
      productCode: item.productCode ?? product.code ?? '',
      imei: item.imei ?? '',
      description: item.description ?? product.name,
      quantity: qty,
      unitPrice: price,
      grossAmount: gross,
      discountPercent: discPct,
      discount: disc,
      netAmount: net,
      vatRate,
      vatAmount: vatAmt,
      totalAmount: total,
      costPriceAtSale: product.purchasePrice ?? 0,
      unitId: item.unitId,
      unitName: item.unitName,
      multiUnitId: item.multiUnitId,
      batchNumber: item.batchNumber,
    });
  }

  const otherDiscount = input.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? 0;
  const lendAddLess = input.lendAddLess ?? 0;
  const roundOff = input.roundOff ?? 0;
  const isVat = input.vatType !== 'NonVat';
  const netAdjustments = otherCharges + freightCharge + lendAddLess + roundOff - otherDiscount;
  const vatFromAdjustments = isVat && netAdjustments !== 0
    ? parseFloat((netAdjustments * vatRatePct / (100 + vatRatePct)).toFixed(2))
    : 0;
  const totalVat = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));
  const taxableAmount = itemsGross - itemsDiscount;
  const subTotal = (input.taxMode === 'inclusive' && isVat) ? taxableAmount : (taxableAmount + itemsVat);
  const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + lendAddLess + roundOff;

  // Net amounts for adjustment ledgers (VAT-excluded when applicable, same as B2C)
  const netFactor = isVat ? 100 / (100 + vatRatePct) : 1;
  const otherDiscountNet = parseFloat((otherDiscount * netFactor).toFixed(2));
  const otherChargesNet = parseFloat((otherCharges * netFactor).toFixed(2));
  const freightChargeNet = parseFloat((freightCharge * netFactor).toFixed(2));
  const lendAddLessNet = parseFloat((lendAddLess * netFactor).toFixed(2));
  const roundOffNet = parseFloat((roundOff * netFactor).toFixed(2));
  const netAdjustmentsNet = otherChargesNet + freightChargeNet + lendAddLessNet - otherDiscountNet + roundOffNet;

  const invoiceNo = await getNextReturnInvoiceNo(input.companyId, input.financialYearId);

  const invoiceDoc = await SalesInvoice.create({
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    invoiceNo,
    date: returnDate,
    time: returnDate.toTimeString().slice(0, 8),
    type: 'Return',
    customerId: input.customerId,
    customerName: input.customerName ?? 'Walk-in',
    customerAddress: input.customerAddress,
    customerPhone: input.customerPhone,
    cashAccountId: input.cashAccountId,
    rateType: 'Retail',
    paymentType: input.cashAccountId ? 'Cash' : (input.customerId ? 'Credit' : 'Cash'),
    vatType: input.vatType ?? 'Vat',
    taxMode: input.taxMode ?? 'exclusive',
    grossAmount: itemsGross,
    discountAmount: itemsDiscount,
    taxableAmount,
    vatAmount: totalVat,
    otherDiscount,
    otherCharges,
    freightCharge,
    lendAddLess,
    roundOff,
    totalAmount: grandTotal,
    cashReceived: 0,
    balance: 0,
    oldBalance: 0,
    netBalance: 0,
    paymentDetails: [],
    narration: input.narration ?? (input.returnType === 'ByRef' && input.originalInvoiceId ? `Sales Return against ${input.originalInvoiceId}` : 'Sales Return'),
    status: 'Final',
    originalInvoiceId: input.returnType === 'ByRef' ? input.originalInvoiceId : undefined,
    createdBy: input.createdBy,
  });

  const invoiceId = invoiceDoc._id;

  for (const line of lineItems) {
    await SalesInvoiceItem.create({
      invoiceId,
      productId: line.productId,
      productCode: line.productCode,
      imei: line.imei,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      grossAmount: line.grossAmount,
      discountPercent: line.discountPercent,
      discount: line.discount,
      netAmount: line.netAmount,
      vatRate: line.vatRate,
      vatAmount: line.vatAmount,
      totalAmount: line.totalAmount,
      costPriceAtSale: line.costPriceAtSale,
      unitId: line.unitId,
      unitName: line.unitName,
      multiUnitId: line.multiUnitId,
      batchNumber: line.batchNumber,
    });
  }

  // Inventory: add stock back (SalesReturn = quantityIn)
  for (const line of lineItems) {
    let stockQtyIn = line.quantity;
    if (line.multiUnitId) {
      const prod = await Product.findById(line.productId).lean();
      if (prod?.multiUnits) {
        const mu = prod.multiUnits.find((m: { multiUnitId?: string }) => m.multiUnitId === line.multiUnitId);
        if (mu && (mu as { conversion?: number }).conversion && (mu as { conversion: number }).conversion > 0) {
          stockQtyIn = line.quantity * (mu as { conversion: number }).conversion;
        }
      }
    }

    await InventoryTransaction.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      productId: line.productId,
      date: returnDate,
      type: 'SalesReturn',
      quantityIn: stockQtyIn,
      quantityOut: 0,
      costPrice: line.costPriceAtSale,
      referenceType: 'SalesInvoice',
      referenceId: invoiceId,
      batchNumber: line.batchNumber || undefined,
      narration: `Sales Return ${invoiceNo}${line.batchNumber ? ` Batch: ${line.batchNumber}` : ''}`,
      createdBy: input.createdBy,
    });
  }

  // Ledger: Debit Sales Return, adjustment ledgers (reversed from sales), Debit VAT; Credit Customer/Cash
  const salesReturnLedger = await findOrCreateSalesReturnLedger(input.companyId);
  const vatLedger = isVat ? await findOrCreateVatLedger(input.companyId) : null;
  const customerLedger = input.customerId ? await LedgerAccount.findById(input.customerId) : null;
  const cashLedger = input.cashAccountId ? await LedgerAccount.findById(input.cashAccountId) : null;
  const creditLedger = cashLedger || customerLedger;

  // Same ledger names as B2C for adjustment details
  const otherDiscountLedger = otherDiscount > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Discount on Sales', 'Expense', 'Expense') : null;
  const otherChargesLedger = otherCharges > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Charges on Sales', 'Revenue', 'Income') : null;
  const freightChargesLedger = freightCharge > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Freight Charges on Sales', 'Revenue', 'Income') : null;
  const travelChargesLedger = lendAddLess > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Travel Charges on Sales', 'Revenue', 'Income') : null;
  const roundOffLedger = Math.abs(roundOff) > 0.001 ? await findOrCreateSpecialLedger(input.companyId, 'Round Off on Sales', 'Expense', 'Expense') : null;

  if (creditLedger) {
    const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];
    const refSuffix = originalInvoiceNo ? ` against ${originalInvoiceNo}` : '';

    // Debit Sales Return (net of VAT and adjustment reversals)
    const salesReturnDebit = grandTotal - totalVat - netAdjustmentsNet;
    voucherLines.push({
      ledgerAccountId: salesReturnLedger._id.toString(),
      debitAmount: salesReturnDebit,
      creditAmount: 0,
      narration: `Sales Return ${invoiceNo}${refSuffix}`,
    });

    // Debit VAT (reverse output VAT)
    if (vatLedger && totalVat > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: totalVat,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - VAT${refSuffix}`,
      });
    }

    // Adjustment ledgers (reverse of B2C sale): Credit Other Discount, Debit Other Charges, Debit Freight, Debit Travel, Round Off reversed
    if (otherDiscountLedger && otherDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: otherDiscountLedger._id.toString(),
        debitAmount: 0,
        creditAmount: otherDiscountNet,
        narration: `Sales Return ${invoiceNo} - Other Discount${refSuffix}`,
      });
    }
    if (otherChargesLedger && otherCharges > 0) {
      voucherLines.push({
        ledgerAccountId: otherChargesLedger._id.toString(),
        debitAmount: otherChargesNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Other Charges${refSuffix}`,
      });
    }
    if (freightChargesLedger && freightCharge > 0) {
      voucherLines.push({
        ledgerAccountId: freightChargesLedger._id.toString(),
        debitAmount: freightChargeNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Freight Charges${refSuffix}`,
      });
    }
    if (travelChargesLedger && lendAddLess > 0) {
      voucherLines.push({
        ledgerAccountId: travelChargesLedger._id.toString(),
        debitAmount: lendAddLessNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Travel Charges${refSuffix}`,
      });
    }
    if (roundOffLedger && Math.abs(roundOff) > 0.001) {
      voucherLines.push({
        ledgerAccountId: roundOffLedger._id.toString(),
        debitAmount: roundOffNet > 0 ? roundOffNet : 0,
        creditAmount: roundOffNet < 0 ? Math.abs(roundOffNet) : 0,
        narration: `Sales Return ${invoiceNo} - Round Off${refSuffix}`,
      });
    }

    // Credit Customer/Cash (refund)
    voucherLines.push({
      ledgerAccountId: creditLedger._id.toString(),
      debitAmount: 0,
      creditAmount: grandTotal,
      narration: cashLedger ? `Sales Return ${invoiceNo} - Cash Refund${refSuffix}` : `Sales Return ${invoiceNo} - On Account${refSuffix}`,
    });

    let totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    let totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01) {
      // Adjust Sales Return debit (first line) to balance
      if (totalDebit > totalCredit) {
        voucherLines[0].debitAmount = (voucherLines[0].debitAmount || 0) - diff;
      } else {
        voucherLines[0].debitAmount = (voucherLines[0].debitAmount || 0) + diff;
      }
    }
    const v = await voucherService.createAndPost({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      voucherType: 'Journal',
      date: returnDate,
      lines: voucherLines,
      narration: `Sales Return ${invoiceNo}${refSuffix}`,
      createdBy: input.createdBy,
    });
    await SalesInvoice.updateOne({ _id: invoiceId }, { voucherId: v._id });
  }

  return { invoiceId: invoiceId.toString(), invoiceNo };
}

export async function updateSalesReturn(
  invoiceId: string,
  companyId: string,
  input: CreateSalesReturnInput,
  userId: string
): Promise<{ invoiceId: string; invoiceNo: string } | null> {
  const existing = await SalesInvoice.findOne({ _id: invoiceId, companyId, type: 'Return' });
  if (!existing) return null;

  const company = await Company.findById(companyId);
  if (!company) throw new AppError('Company not found', 404);
  if (input.returnType === 'ByRef' && !input.originalInvoiceId) {
    throw new AppError('Original invoice is required when return type is By Ref', 400);
  }

  const vatRatePct = input.vatType === 'NonVat' ? 0 : (company.vatConfig?.standardRate ?? 5);
  const returnDate = input.date ? new Date(input.date) : existing.date;
  const invoiceNo = existing.invoiceNo;

  let originalInvoiceNo: string | undefined;
  if (input.returnType === 'ByRef' && input.originalInvoiceId) {
    const originalInvoice = await SalesInvoice.findOne({ _id: input.originalInvoiceId, companyId: input.companyId }).lean();
    if (!originalInvoice) {
      throw new AppError('Original invoice not found', 404);
    }
    originalInvoiceNo = originalInvoice.invoiceNo;
    const originalItems = await SalesInvoiceItem.find({ invoiceId: originalInvoice._id }).lean();
    
    // Find all returns against this invoice, excluding the current return we are updating
    const otherReturns = await SalesInvoice.find({
      companyId: input.companyId,
      type: 'Return',
      status: { $ne: 'Cancelled' },
      originalInvoiceId: originalInvoice._id,
      _id: { $ne: new mongoose.Types.ObjectId(invoiceId) }
    }).select('_id').lean();

    const returnedQuantities: Record<string, number> = {};
    if (otherReturns.length > 0) {
      const returnIds = otherReturns.map((r) => r._id);
      const returnItems = await SalesInvoiceItem.find({ invoiceId: { $in: returnIds } }).lean();
      for (const ri of returnItems) {
        const pId = ri.productId ? ri.productId.toString() : '';
        const key = `${pId}_${ri.batchNumber || ''}`;
        returnedQuantities[key] = (returnedQuantities[key] || 0) + (ri.quantity || 0);
      }
    }

    // Merge items with same product + same batch to check total requested return qty
    const checkMergedItems: typeof input.items = [];
    const keyToIndex = new Map<string, number>();
    for (const item of input.items) {
      const key = `${item.productId}|${item.batchNumber ?? ''}`;
      const existingIdx = keyToIndex.get(key);
      if (existingIdx !== undefined) {
        checkMergedItems[existingIdx] = {
          ...checkMergedItems[existingIdx],
          quantity: (checkMergedItems[existingIdx].quantity ?? 0) + (item.quantity ?? 0),
        };
      } else {
        keyToIndex.set(key, checkMergedItems.length);
        checkMergedItems.push({ ...item });
      }
    }

    for (const item of checkMergedItems) {
      const matchingOriginalItems = originalItems.filter(
        (oi) =>
          oi.productId.toString() === item.productId.toString() &&
          (item.batchNumber ? oi.batchNumber === item.batchNumber : true)
      );
      if (matchingOriginalItems.length === 0) {
        throw new AppError(`Item "${item.description || 'Unknown'}" was not purchased in the referenced invoice.`, 400);
      }
      
      const totalPurchasedQty = matchingOriginalItems.reduce((sum, oi) => sum + (oi.quantity || 0), 0);
      
      let prevReturned = 0;
      if (item.batchNumber) {
        const key = `${item.productId}_${item.batchNumber}`;
        prevReturned = returnedQuantities[key] || 0;
      } else {
        const prefix = `${item.productId}_`;
        for (const [k, qty] of Object.entries(returnedQuantities)) {
          if (k.startsWith(prefix)) {
            prevReturned += qty;
          }
        }
      }
      
      const remaining = Math.max(0, totalPurchasedQty - prevReturned);

      if (item.quantity > remaining) {
        const desc = matchingOriginalItems[0].description || item.description || 'Unknown';
        throw new AppError(
          `Cannot return ${item.quantity} units of "${desc}". Only ${remaining} units are returnable (purchased: ${totalPurchasedQty}, already returned: ${prevReturned}).`,
          400
        );
      }
    }
  }

  // Remove old effects: inventory and ledger
  await InventoryTransaction.deleteMany({ referenceId: existing._id, referenceType: 'SalesInvoice' });
  await SalesInvoiceItem.deleteMany({ invoiceId: existing._id });
  if (existing.voucherId) {
    try {
      const { LedgerEntry } = await import('../models/LedgerEntry');
      await LedgerEntry.deleteMany({ voucherId: existing.voucherId });
      await Voucher.deleteOne({ _id: existing.voucherId });
    } catch (e) {
      console.error(`[Sales Return Update] Failed to remove voucher ${existing.voucherId}:`, (e as Error).message || e);
    }
  }

  let itemsGross = 0;
  let itemsDiscount = 0;
  let itemsVat = 0;

  const lineItems: Array<{
    productId: mongoose.Types.ObjectId;
    productCode: string;
    imei?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    grossAmount: number;
    discountPercent: number;
    discount: number;
    netAmount: number;
    vatRate: number;
    vatAmount: number;
    totalAmount: number;
    costPriceAtSale: number;
    unitId?: string;
    unitName?: string;
    multiUnitId?: string;
    batchNumber?: string;
  }> = [];

  const mergedItems: typeof input.items = [];
  const keyToIndex = new Map<string, number>();
  for (const item of input.items) {
    const key = `${item.productId}|${item.batchNumber ?? ''}`;
    const existingIdx = keyToIndex.get(key);
    if (existingIdx !== undefined) {
      mergedItems[existingIdx] = {
        ...mergedItems[existingIdx],
        quantity: (mergedItems[existingIdx].quantity ?? 0) + (item.quantity ?? 0),
        discount: (mergedItems[existingIdx].discount ?? 0) + (item.discount ?? 0),
      };
    } else {
      keyToIndex.set(key, mergedItems.length);
      mergedItems.push({ ...item });
    }
  }

  for (const item of mergedItems) {
    const product = await Product.findById(item.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${item.productId}`, 404);
    }
    const qty = item.quantity;
    const price = item.unitPrice;
    const gross = qty * price;
    const discPct = item.discountPercent ?? 0;
    const disc = item.discount ?? (gross * discPct / 100);
    const net = gross - disc;
    const vatRate = input.vatType === 'NonVat' ? 0 : vatRatePct;
    const taxMode = input.taxMode ?? 'exclusive';
    let vatAmt: number;
    let total: number;
    if (input.vatType === 'Vat' && taxMode === 'inclusive' && vatRate > 0) {
      vatAmt = parseFloat((net * vatRate / (100 + vatRate)).toFixed(2));
      total = parseFloat(net.toFixed(2));
    } else {
      vatAmt = parseFloat((net * (vatRate / 100)).toFixed(2));
      total = parseFloat((net + vatAmt).toFixed(2));
    }
    itemsGross += gross;
    itemsDiscount += disc;
    itemsVat += vatAmt;

    lineItems.push({
      productId: product._id,
      productCode: item.productCode ?? product.code ?? '',
      imei: item.imei ?? '',
      description: item.description ?? product.name,
      quantity: qty,
      unitPrice: price,
      grossAmount: gross,
      discountPercent: discPct,
      discount: disc,
      netAmount: net,
      vatRate,
      vatAmount: vatAmt,
      totalAmount: total,
      costPriceAtSale: product.purchasePrice ?? 0,
      unitId: item.unitId,
      unitName: item.unitName,
      multiUnitId: item.multiUnitId,
      batchNumber: item.batchNumber,
    });
  }

  const otherDiscount = input.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? 0;
  const lendAddLess = input.lendAddLess ?? 0;
  const roundOff = input.roundOff ?? 0;
  const isVat = input.vatType !== 'NonVat';
  const netAdjustments = otherCharges + freightCharge + lendAddLess + roundOff - otherDiscount;
  const vatFromAdjustments = isVat && netAdjustments !== 0
    ? parseFloat((netAdjustments * vatRatePct / (100 + vatRatePct)).toFixed(2))
    : 0;
  const totalVat = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));
  const taxableAmount = itemsGross - itemsDiscount;
  const subTotal = (input.taxMode === 'inclusive' && isVat) ? taxableAmount : (taxableAmount + itemsVat);
  const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + lendAddLess + roundOff;

  const netFactor = isVat ? 100 / (100 + vatRatePct) : 1;
  const otherDiscountNet = parseFloat((otherDiscount * netFactor).toFixed(2));
  const otherChargesNet = parseFloat((otherCharges * netFactor).toFixed(2));
  const freightChargeNet = parseFloat((freightCharge * netFactor).toFixed(2));
  const lendAddLessNet = parseFloat((lendAddLess * netFactor).toFixed(2));
  const roundOffNet = parseFloat((roundOff * netFactor).toFixed(2));
  const netAdjustmentsNet = otherChargesNet + freightChargeNet + lendAddLessNet - otherDiscountNet + roundOffNet;

  for (const line of lineItems) {
    await SalesInvoiceItem.create({
      invoiceId: existing._id,
      productId: line.productId,
      productCode: line.productCode,
      imei: line.imei,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      grossAmount: line.grossAmount,
      discountPercent: line.discountPercent,
      discount: line.discount,
      netAmount: line.netAmount,
      vatRate: line.vatRate,
      vatAmount: line.vatAmount,
      totalAmount: line.totalAmount,
      costPriceAtSale: line.costPriceAtSale,
      unitId: line.unitId,
      unitName: line.unitName,
      multiUnitId: line.multiUnitId,
      batchNumber: line.batchNumber,
    });
  }

  for (const line of lineItems) {
    let stockQtyIn = line.quantity;
    if (line.multiUnitId) {
      const prod = await Product.findById(line.productId).lean();
      if (prod?.multiUnits) {
        const mu = prod.multiUnits.find((m: { multiUnitId?: string }) => m.multiUnitId === line.multiUnitId);
        if (mu && (mu as { conversion?: number }).conversion && (mu as { conversion: number }).conversion > 0) {
          stockQtyIn = line.quantity * (mu as { conversion: number }).conversion;
        }
      }
    }

    await InventoryTransaction.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      productId: line.productId,
      date: returnDate,
      type: 'SalesReturn',
      quantityIn: stockQtyIn,
      quantityOut: 0,
      costPrice: line.costPriceAtSale,
      referenceType: 'SalesInvoice',
      referenceId: existing._id,
      batchNumber: line.batchNumber || undefined,
      narration: `Sales Return ${invoiceNo}${line.batchNumber ? ` Batch: ${line.batchNumber}` : ''}`,
      createdBy: userId,
    });
  }

  await SalesInvoice.updateOne(
    { _id: existing._id },
    {
      $set: {
        date: returnDate,
        customerId: input.customerId,
        customerName: input.customerName ?? 'Walk-in',
        customerAddress: input.customerAddress,
        customerPhone: input.customerPhone,
        cashAccountId: input.cashAccountId,
        vatType: input.vatType ?? 'Vat',
        taxMode: input.taxMode ?? 'exclusive',
        grossAmount: itemsGross,
        discountAmount: itemsDiscount,
        taxableAmount: itemsGross - itemsDiscount,
        vatAmount: totalVat,
        otherDiscount,
        otherCharges,
        freightCharge,
        lendAddLess,
        roundOff,
        totalAmount: grandTotal,
        narration: input.narration ?? (input.returnType === 'ByRef' && input.originalInvoiceId ? `Sales Return against ${input.originalInvoiceId}` : 'Sales Return'),
        originalInvoiceId: input.returnType === 'ByRef' ? input.originalInvoiceId : undefined,
      },
    }
  );

  const salesReturnLedger = await findOrCreateSalesReturnLedger(input.companyId);
  const vatLedger = isVat ? await findOrCreateVatLedger(input.companyId) : null;
  const customerLedger = input.customerId ? await LedgerAccount.findById(input.customerId) : null;
  const cashLedger = input.cashAccountId ? await LedgerAccount.findById(input.cashAccountId) : null;
  const creditLedger = cashLedger || customerLedger;

  const otherDiscountLedger = otherDiscount > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Discount on Sales', 'Expense', 'Expense') : null;
  const otherChargesLedger = otherCharges > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Charges on Sales', 'Revenue', 'Income') : null;
  const freightChargesLedger = freightCharge > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Freight Charges on Sales', 'Revenue', 'Income') : null;
  const travelChargesLedger = lendAddLess > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Travel Charges on Sales', 'Revenue', 'Income') : null;
  const roundOffLedger = Math.abs(roundOff) > 0.001 ? await findOrCreateSpecialLedger(input.companyId, 'Round Off on Sales', 'Expense', 'Expense') : null;

  if (creditLedger) {
    const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];
    const refSuffix = originalInvoiceNo ? ` against ${originalInvoiceNo}` : '';

    const salesReturnDebit = grandTotal - totalVat - netAdjustmentsNet;
    voucherLines.push({
      ledgerAccountId: salesReturnLedger._id.toString(),
      debitAmount: salesReturnDebit,
      creditAmount: 0,
      narration: `Sales Return ${invoiceNo}${refSuffix}`,
    });
    if (vatLedger && totalVat > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: totalVat,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - VAT${refSuffix}`,
      });
    }
    if (otherDiscountLedger && otherDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: otherDiscountLedger._id.toString(),
        debitAmount: 0,
        creditAmount: otherDiscountNet,
        narration: `Sales Return ${invoiceNo} - Other Discount${refSuffix}`,
      });
    }
    if (otherChargesLedger && otherCharges > 0) {
      voucherLines.push({
        ledgerAccountId: otherChargesLedger._id.toString(),
        debitAmount: otherChargesNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Other Charges${refSuffix}`,
      });
    }
    if (freightChargesLedger && freightCharge > 0) {
      voucherLines.push({
        ledgerAccountId: freightChargesLedger._id.toString(),
        debitAmount: freightChargeNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Freight Charges${refSuffix}`,
      });
    }
    if (travelChargesLedger && lendAddLess > 0) {
      voucherLines.push({
        ledgerAccountId: travelChargesLedger._id.toString(),
        debitAmount: lendAddLessNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Travel Charges${refSuffix}`,
      });
    }
    if (roundOffLedger && Math.abs(roundOff) > 0.001) {
      voucherLines.push({
        ledgerAccountId: roundOffLedger._id.toString(),
        debitAmount: roundOffNet > 0 ? roundOffNet : 0,
        creditAmount: roundOffNet < 0 ? Math.abs(roundOffNet) : 0,
        narration: `Sales Return ${invoiceNo} - Round Off${refSuffix}`,
      });
    }
    voucherLines.push({
      ledgerAccountId: creditLedger._id.toString(),
      debitAmount: 0,
      creditAmount: grandTotal,
      narration: cashLedger ? `Sales Return ${invoiceNo} - Cash Refund${refSuffix}` : `Sales Return ${invoiceNo} - On Account${refSuffix}`,
    });

    let totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    let totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01) {
      if (totalDebit > totalCredit) {
        voucherLines[0].debitAmount = (voucherLines[0].debitAmount || 0) - diff;
      } else {
        voucherLines[0].debitAmount = (voucherLines[0].debitAmount || 0) + diff;
      }
    }
    const v = await voucherService.createAndPost({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      voucherType: 'Journal',
      date: returnDate,
      lines: voucherLines,
      narration: `Sales Return ${invoiceNo}${refSuffix}`,
      createdBy: userId,
    });
    await SalesInvoice.updateOne({ _id: existing._id }, { voucherId: v._id });
  }

  return { invoiceId: existing._id.toString(), invoiceNo };
}

export async function searchSalesReturnByInvoiceNo(companyId: string, invoiceNo: string) {
  const invoice = await SalesInvoice.findOne({
    companyId,
    type: 'Return',
    invoiceNo: new RegExp(invoiceNo.trim(), 'i'),
  }).lean();
  if (!invoice) return null;
  return getSalesReturn(invoice._id.toString(), companyId);
}

export async function getSalesReturn(invoiceId: string, companyId: string) {
  let invoice: any = null;
  const isObjectId = mongoose.Types.ObjectId.isValid(invoiceId);

  if (isObjectId) {
    invoice = await SalesInvoice.findOne({ _id: invoiceId, companyId, type: 'Return' })
      .populate('originalInvoiceId', 'invoiceNo')
      .lean();
    if (!invoice) {
      invoice = await SalesInvoice.findOne({ voucherId: new mongoose.Types.ObjectId(invoiceId), companyId, type: 'Return' })
        .populate('originalInvoiceId', 'invoiceNo')
        .lean();
    }
  }

  if (!invoice) {
    invoice = await SalesInvoice.findOne({ invoiceNo: invoiceId, companyId, type: 'Return' })
      .populate('originalInvoiceId', 'invoiceNo')
      .lean();
  }

  if (!invoice) return null;
  const items = await SalesInvoiceItem.find({ invoiceId: invoice._id }).lean();
  return {
    _id: invoice._id,
    invoiceNo: invoice.invoiceNo,
    date: invoice.date,
    returnType: invoice.originalInvoiceId ? 'ByRef' : 'OnAccount',
    originalInvoiceId: invoice.originalInvoiceId ? String((invoice.originalInvoiceId as any)._id || invoice.originalInvoiceId) : undefined,
    originalInvoiceNo: invoice.originalInvoiceId && typeof invoice.originalInvoiceId === 'object'
      ? (invoice.originalInvoiceId as any).invoiceNo
      : undefined,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    customerAddress: invoice.customerAddress,
    cashAccountId: invoice.cashAccountId,
    vatType: invoice.vatType,
    taxMode: invoice.taxMode ?? 'exclusive',
    items: items.map((i) => ({
      _id: i._id,
      productId: i.productId,
      productCode: i.productCode,
      imei: i.imei,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount,
      totalAmount: i.totalAmount,
      unitName: i.unitName,
      batchNumber: i.batchNumber,
    })),
    otherDiscount: invoice.otherDiscount,
    otherCharges: invoice.otherCharges,
    freightCharge: invoice.freightCharge,
    lendAddLess: invoice.lendAddLess,
    roundOff: invoice.roundOff,
    totalAmount: invoice.totalAmount,
    narration: invoice.narration,
  };
}

export async function deleteSalesReturn(invoiceId: string, companyId: string): Promise<boolean> {
  const invoice = await SalesInvoice.findOne({ _id: invoiceId, companyId, type: 'Return' });
  if (!invoice) return false;

  await SalesInvoiceItem.deleteMany({ invoiceId });
  await InventoryTransaction.deleteMany({ referenceId: invoiceId, referenceType: 'SalesInvoice' });

  if (invoice.voucherId) {
    try {
      const { LedgerEntry } = await import('../models/LedgerEntry');
      await LedgerEntry.deleteMany({ voucherId: invoice.voucherId });
      await Voucher.deleteOne({ _id: invoice.voucherId });
    } catch (e) {
      console.error(`[Sales Return Delete] Failed to reverse voucher ${invoice.voucherId}:`, (e as Error).message || e);
    }
  }

  await SalesInvoice.deleteOne({ _id: invoiceId });
  return true;
}

// ==================== Doctor Management ====================

export async function getDoctors(companyId: string) {
  return Doctor.find({ companyId, isActive: true }).sort({ name: 1 }).lean();
}

export async function createDoctor(input: {
  companyId: string;
  name: string;
  licenseNumber: string;
  licensingAuthority?: string;
  phone?: string;
  specialty?: string;
}) {
  if (!input.name || !input.licenseNumber) {
    throw new AppError('Doctor name and license number are required', 400);
  }
  const existing = await Doctor.findOne({
    companyId: input.companyId,
    $or: [{ name: input.name.trim() }, { licenseNumber: input.licenseNumber.trim() }],
  });
  if (existing) {
    existing.name = input.name.trim();
    existing.licenseNumber = input.licenseNumber.trim();
    if (input.licensingAuthority) existing.licensingAuthority = input.licensingAuthority;
    if (input.phone) existing.phone = input.phone;
    if (input.specialty) existing.specialty = input.specialty;
    await existing.save();
    return existing;
  }
  return Doctor.create({
    companyId: input.companyId,
    name: input.name.trim(),
    licenseNumber: input.licenseNumber.trim(),
    licensingAuthority: input.licensingAuthority || 'MOHAP',
    phone: input.phone,
    specialty: input.specialty,
    isActive: true,
  });
}

// ==================== Patient Management ====================

export async function getPatients(companyId: string, search?: string) {
  const filter: any = { companyId };
  if (search && search.trim()) {
    const q = search.trim();
    filter.$or = [
      { fullName: new RegExp(q, 'i') },
      { emiratesId: new RegExp(q, 'i') },
      { phone: new RegExp(q, 'i') },
      { mrn: new RegExp(q, 'i') },
    ];
  }
  return Patient.find(filter).sort({ fullName: 1 }).limit(100).lean();
}

export async function findPatientByEmiratesId(companyId: string, emiratesId: string) {
  const cleanId = emiratesId.replace(/\D/g, '');
  return Patient.findOne({
    companyId,
    emiratesId: { $regex: new RegExp(cleanId.length >= 10 ? cleanId.slice(-9) : cleanId, 'i') },
  }).lean();
}

export async function createPatient(input: {
  companyId: string;
  emiratesId?: string;
  firstName: string;
  familyName?: string;
  dob?: string;
  gender?: 'Female' | 'Male' | 'Unknown';
  mrn?: string;
  phone?: string;
  language?: string;
  emirate?: string;
  city?: string;
  street?: string;
  country?: string;
  prescriptionNumber?: string;
  prescriptionDate?: string;
}) {
  if (!input.firstName || !input.firstName.trim()) {
    throw new AppError('First name is required', 400);
  }
  const fName = input.firstName.trim();
  const famName = (input.familyName || '').trim();
  const fullName = famName ? `${fName} ${famName}` : fName;
  let existing = null;
  if (input.emiratesId && input.emiratesId.trim()) {
    existing = await Patient.findOne({ companyId: input.companyId, emiratesId: input.emiratesId.trim() });
  }
  if (!existing) {
    existing = await Patient.findOne({ companyId: input.companyId, fullName });
  }

  if (existing) {
    Object.assign(existing, {
      ...input,
      fullName,
      firstName: fName,
      familyName: famName,
    });
    await existing.save();
    return existing;
  }

  return Patient.create({
    ...input,
    fullName,
    firstName: fName,
    familyName: famName,
    country: input.country || 'United Arab Emirates',
    language: input.language || 'English',
  });
}

function productVatPercent(prod: { vatCategory?: string; vatPercent?: number } | null | undefined): number {
  if (!prod) return 0;
  if (prod.vatCategory === 'zero' || prod.vatCategory === 'exempt') return 0;
  return Number(prod.vatPercent || 0) || 0;
}

/** Stored purchase rate is inclusive unless the last purchase was exclusive. Gross = ex-VAT. */
function toGrossPurchaseRate(
  storedRate: number,
  vatPercent: number,
  taxMode: 'inclusive' | 'exclusive' = 'inclusive'
): number {
  const rate = Number(storedRate) || 0;
  if (!(vatPercent > 0) || taxMode === 'exclusive') return rate;
  return parseFloat((rate / (1 + vatPercent / 100)).toFixed(4));
}

function salesItemProductId(item: { productId?: unknown }): string {
  const p = item.productId as { _id?: unknown } | string | undefined;
  if (!p) return '';
  if (typeof p === 'object' && p._id) return String(p._id);
  return String(p);
}

async function loadPurchaseTaxModeMap(
  companyId: string,
  productIds: string[]
): Promise<Map<string, 'inclusive' | 'exclusive'>> {
  const map = new Map<string, 'inclusive' | 'exclusive'>();
  const unique = [...new Set(productIds.filter((id) => id && mongoose.Types.ObjectId.isValid(id)))];
  if (unique.length === 0) return map;

  const rows = await InventoryTransaction.aggregate([
    {
      $match: {
        companyId: new mongoose.Types.ObjectId(companyId),
        productId: { $in: unique.map((id) => new mongoose.Types.ObjectId(id)) },
        type: { $in: ['Purchase', 'Opening', 'Adjustment'] },
        quantityIn: { $gt: 0 },
      },
    },
    { $sort: { date: -1, createdAt: -1 } },
    {
      $group: {
        _id: '$productId',
        taxMode: { $first: '$taxMode' },
      },
    },
  ]);

  for (const row of rows) {
    map.set(row._id.toString(), row.taxMode === 'exclusive' ? 'exclusive' : 'inclusive');
  }
  return map;
}

function grossPurchaseAmountForItem(
  item: { quantity?: number; costPriceAtSale?: number; productId?: unknown },
  prod: { _id?: unknown; purchasePrice?: number; vatPercent?: number; vatCategory?: string } | null | undefined,
  taxModeMap: Map<string, 'inclusive' | 'exclusive'>
): number {
  const qty = Number(item.quantity || 0);
  const stored =
    Number(item.costPriceAtSale) > 0 ? Number(item.costPriceAtSale) : Number(prod?.purchasePrice || 0);
  const pid = (prod?._id ? String(prod._id) : '') || salesItemProductId(item);
  const taxMode = taxModeMap.get(pid) || 'inclusive';
  return Number((qty * toGrossPurchaseRate(stored, productVatPercent(prod), taxMode)).toFixed(2));
}

export interface SalesReportFilterOpts {
  filterType?: 'default' | 'product' | 'product_total' | 'month' | 'daily' | 'monthly';
  productId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  salesType?: string;
}

export async function getSalesReport(
  companyId: string,
  financialYearId?: string,
  opts: SalesReportFilterOpts = {}
) {
  const filterType = opts.filterType || 'default';
  const filter: Record<string, unknown> = {
    companyId: new mongoose.Types.ObjectId(companyId),
    status: { $ne: 'Cancelled' },
  };

  if (opts.salesType && opts.salesType !== 'ALL') {
    if (opts.salesType === 'B2C') {
      filter.type = 'B2C';
    } else if (opts.salesType === 'B2B') {
      filter.type = 'B2B';
    } else if (opts.salesType === 'POS') {
      filter.type = 'POS';
    } else if (opts.salesType === 'Return') {
      filter.type = 'Return';
    } else if (opts.salesType === 'Quotation') {
      filter.type = 'Quotation';
    } else {
      filter.type = opts.salesType;
    }
  } else {
    filter.type = { $in: ['POS', 'B2C', 'B2B'] };
  }

  if (financialYearId && mongoose.Types.ObjectId.isValid(financialYearId)) {
    filter.financialYearId = new mongoose.Types.ObjectId(financialYearId);
  }

  if (opts.fromDate || opts.toDate) {
    const dateFilter: Record<string, Date> = {};
    if (opts.fromDate) {
      const from = new Date(opts.fromDate);
      from.setHours(0, 0, 0, 0);
      dateFilter.$gte = from;
    }
    if (opts.toDate) {
      const to = new Date(opts.toDate);
      to.setHours(23, 59, 59, 999);
      dateFilter.$lte = to;
    }
    filter.date = dateFilter;
  }

  // 1. DEFAULT VIEW: INVOICE WISE
  if (filterType === 'default') {
    const invoices = await SalesInvoice.find(filter)
      .populate('customerId', 'name code')
      .populate('createdBy', 'fullName username')
      .populate('salesmanId', 'fullName username')
      .populate('locationId', 'name')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const invoiceIds = invoices.map((i) => i._id);

    // Fetch items to compute gross (ex-VAT) purchase amount
    const items = await SalesInvoiceItem.find({ invoiceId: { $in: invoiceIds } })
      .populate('productId', 'purchasePrice code name vatPercent vatCategory')
      .lean();

    const taxModeMap = await loadPurchaseTaxModeMap(
      companyId,
      items.map((item) => salesItemProductId(item))
    );
    const invoicePurchaseMap: Record<string, number> = {};
    for (const item of items) {
      const invIdStr = item.invoiceId.toString();
      const prod = item.productId as any;
      invoicePurchaseMap[invIdStr] =
        (invoicePurchaseMap[invIdStr] || 0) + grossPurchaseAmountForItem(item, prod, taxModeMap);
    }

    let rows = invoices.map((inv) => {
      const invIdStr = inv._id.toString();
      const customer = inv.customerId as any;
      const customerName = inv.customerName || customer?.name || 'Walk-in / Cash Customer';
      const grossAmount = Number(inv.grossAmount || 0);
      const otherDiscount = Number(inv.otherDiscount || 0);
      const freightCharge = Number(inv.freightCharge || 0);
      const otherCharge = Number(inv.otherCharges || 0);
      const travelcharge = Number(inv.lendAddLess || 0);
      const vatAmount = Number(inv.vatAmount || 0);
      const roundoff = Number(inv.roundOff || 0);
      const grandTotal = Number(inv.totalAmount || 0);
      const totalPurchaseAmount = Number((invoicePurchaseMap[invIdStr] || 0).toFixed(2));
      const totalProfit = Number(((grandTotal - vatAmount) - totalPurchaseAmount).toFixed(2));

      const createdUser = inv.createdBy as any;
      const salesman = inv.salesmanId as any;
      const user =
        createdUser?.fullName ||
        createdUser?.username ||
        salesman?.fullName ||
        salesman?.username ||
        'Admin';
      const location = (inv.locationId as any)?.name || 'Main Location';

      let cashReceived = Number(inv.cashReceived || 0);
      let cardReceived = 0;
      if (Array.isArray(inv.paymentDetails) && inv.paymentDetails.length > 0) {
        for (const pd of inv.paymentDetails) {
          if (/card/i.test(pd.mode)) {
            cardReceived += Number(pd.amount || 0);
          } else if (/cash/i.test(pd.mode) && !inv.cashReceived) {
            cashReceived += Number(pd.amount || 0);
          }
        }
      }
      if (inv.paymentType === 'Cash' && cashReceived === 0 && cardReceived === 0) {
        cashReceived = grandTotal;
      }

      let cashPaid = 0;
      if (inv.type === 'Return') {
        if (inv.paymentType === 'Cash' || inv.cashAccountId || (!inv.customerId && (!inv.paymentDetails || inv.paymentDetails.length === 0))) {
          cashPaid = grandTotal;
        } else if (inv.cashReceived) {
          cashPaid = Number(inv.cashReceived);
        }
      }

      return {
        _id: invIdStr,
        invoiceId: invIdStr,
        type: inv.type,
        entryNumber: inv.invoiceNo,
        date: inv.date,
        customerName,
        grossAmount: Number(grossAmount.toFixed(2)),
        otherDiscount: Number(otherDiscount.toFixed(2)),
        freightCharge: Number(freightCharge.toFixed(2)),
        otherCharge: Number(otherCharge.toFixed(2)),
        travelcharge: Number(travelcharge.toFixed(2)),
        vatAmount: Number(vatAmount.toFixed(2)),
        roundoff: Number(roundoff.toFixed(2)),
        grandTotal: Number(grandTotal.toFixed(2)),
        totalPurchaseAmount,
        totalProfit,
        user,
        location,
        cashReceived: Number(cashReceived.toFixed(2)),
        cardReceived: Number(cardReceived.toFixed(2)),
        cashPaid: Number(cashPaid.toFixed(2)),
      };
    });

    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.entryNumber.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.user.toLowerCase().includes(q)
      );
    }

    return { filterType: 'default', rows };
  }

  // 2. PRODUCT WISE: DETAILED TRANSACTIONS (FOR ALL PRODUCTS OR SPECIFIC PRODUCT)
  if (filterType === 'product') {
    const invoices = await SalesInvoice.find(filter)
      .populate('customerId', 'name code')
      .select('_id invoiceNo date customerName customerId type')
      .lean();

    const invoiceIds = invoices.map((i) => i._id);

    const isSpecific = Boolean(
      opts.productId && opts.productId !== 'ALL' && mongoose.Types.ObjectId.isValid(opts.productId)
    );

    const itemFilter: Record<string, any> = {
      invoiceId: { $in: invoiceIds },
    };
    if (isSpecific) {
      itemFilter.productId = new mongoose.Types.ObjectId(opts.productId);
    }

    const items = await SalesInvoiceItem.find(itemFilter)
      .populate({
        path: 'invoiceId',
        select: 'invoiceNo date customerName customerId type',
        populate: { path: 'customerId', select: 'name code' },
      })
      .populate({
        path: 'productId',
        select:
          'code name sku systemBarcode internationalBarcode genericName officialCode packageUnit purchasePrice vatPercent vatCategory unitOfMeasureId categoryId brand',
        populate: [
          { path: 'unitOfMeasureId', select: 'name shortCode' },
          { path: 'categoryId', select: 'name code' },
        ],
      })
      .sort({ _id: -1 })
      .lean();

    const taxModeMap = await loadPurchaseTaxModeMap(
      companyId,
      items.map((item) => salesItemProductId(item))
    );

    let rows = items.map((item) => {
      const inv = item.invoiceId as any;
      const prod = item.productId as any;
      const uom = prod?.unitOfMeasureId;
      const unit = item.unitName || prod?.packageUnit || uom?.shortCode || uom?.name || 'Pcs';
      const customer = inv?.customerId;
      const customerName = inv?.customerName || customer?.name || 'Walk-in / Cash Customer';
      const category = prod?.categoryId as any;
      const categoryName = category?.name || '';
      const brand = prod?.brand || '';
      const qty = Number(item.quantity || 0);
      const totalAmount = Number(item.totalAmount || 0);
      const vat = Number(item.vatAmount || 0);
      const purchaseAmount = grossPurchaseAmountForItem(item, prod, taxModeMap);
      const profit = Number(((totalAmount - vat) - purchaseAmount).toFixed(2));

      return {
        _id: item._id.toString(),
        invoiceId: inv?._id?.toString(),
        productId: prod?._id?.toString(),
        type: inv?.type,
        date: inv?.date,
        invNumber: inv?.invoiceNo || '',
        customerName,
        productCode: item.productCode || prod?.code || prod?.sku || '',
        productName: prod?.name || '',
        productBarcode: prod?.systemBarcode || prod?.internationalBarcode || prod?.sku || '',
        productOfficialName: prod?.genericName || prod?.officialCode || '',
        category: categoryName,
        brand,
        unit,
        qty: Number(qty.toFixed(2)),
        totalAmount: Number(totalAmount.toFixed(2)),
        purchaseAmount,
        vat: Number(vat.toFixed(2)),
        profit,
      };
    });

    // Sort by date descending
    rows.sort((a, b) => {
      const timeA = a.date ? new Date(a.date).getTime() : 0;
      const timeB = b.date ? new Date(b.date).getTime() : 0;
      return timeB - timeA;
    });

    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.invNumber.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.productCode.toLowerCase().includes(q) ||
          r.productBarcode.toLowerCase().includes(q) ||
          r.productOfficialName.toLowerCase().includes(q) ||
          (r.category && r.category.toLowerCase().includes(q)) ||
          (r.brand && r.brand.toLowerCase().includes(q))
      );
    }

    return { filterType: 'product', isSpecificProduct: isSpecific, rows };
  }

  // 3. PRODUCT WISE TOTAL: AGGREGATED PRODUCT TOTALS FOR PERIOD
  if (filterType === 'product_total') {
    const invoices = await SalesInvoice.find(filter)
      .select('_id')
      .lean();

    const invoiceIds = invoices.map((i) => i._id);

    const itemFilter: Record<string, any> = { invoiceId: { $in: invoiceIds } };
    if (opts.productId && opts.productId !== 'ALL' && mongoose.Types.ObjectId.isValid(opts.productId)) {
      itemFilter.productId = new mongoose.Types.ObjectId(opts.productId);
    }

    const items = await SalesInvoiceItem.find(itemFilter)
      .populate({
        path: 'invoiceId',
        select: 'customerName customerId',
        populate: { path: 'customerId', select: 'name code' },
      })
      .populate({
        path: 'productId',
        select:
          'code name sku systemBarcode internationalBarcode genericName officialCode packageUnit purchasePrice vatPercent vatCategory unitOfMeasureId categoryId brand',
        populate: [
          { path: 'unitOfMeasureId', select: 'name shortCode' },
          { path: 'categoryId', select: 'name code' },
        ],
      })
      .lean();

    const taxModeMap = await loadPurchaseTaxModeMap(
      companyId,
      items.map((item) => salesItemProductId(item))
    );

    const prodMap: Record<string, any> = {};
    for (const item of items) {
      const prod = item.productId as any;
      if (!prod) continue;
      const prodIdStr = prod._id.toString();
      const inv = item.invoiceId as any;
      const cust = inv?.customerId as any;
      const custName = inv?.customerName || cust?.name || 'Walk-in / Cash Customer';
      const category = prod.categoryId as any;
      const categoryName = category?.name || '';
      const brand = prod.brand || '';

      if (!prodMap[prodIdStr]) {
        const uom = prod.unitOfMeasureId;
        const unit = item.unitName || prod.packageUnit || uom?.shortCode || uom?.name || 'Pcs';
        prodMap[prodIdStr] = {
          productId: prodIdStr,
          productCode: item.productCode || prod.code || prod.sku || '',
          productName: prod.name || '',
          productBarcode: prod.systemBarcode || prod.internationalBarcode || prod.sku || '',
          productOfficialName: prod.genericName || prod.officialCode || '',
          category: categoryName,
          brand,
          customerNames: new Set<string>(),
          unit,
          qty: 0,
          totalAmount: 0,
          purchaseAmount: 0,
          vat: 0,
          profit: 0,
        };
      }

      if (custName) {
        prodMap[prodIdStr].customerNames.add(custName);
      }

      const qty = Number(item.quantity || 0);
      const totalAmount = Number(item.totalAmount || 0);
      const vat = Number(item.vatAmount || 0);
      const purchaseAmount = grossPurchaseAmountForItem(item, prod, taxModeMap);
      const profit = Number(((totalAmount - vat) - purchaseAmount).toFixed(2));

      prodMap[prodIdStr].qty += qty;
      prodMap[prodIdStr].totalAmount += totalAmount;
      prodMap[prodIdStr].purchaseAmount += purchaseAmount;
      prodMap[prodIdStr].vat += vat;
      prodMap[prodIdStr].profit += profit;
    }

    let rows = Object.values(prodMap).map((r) => {
      const cNames = Array.from(r.customerNames as Set<string>);
      return {
        ...r,
        customerNames: cNames,
        customerName: cNames.join(', '),
        qty: Number(r.qty.toFixed(2)),
        totalAmount: Number(r.totalAmount.toFixed(2)),
        purchaseAmount: Number(r.purchaseAmount.toFixed(2)),
        vat: Number(r.vat.toFixed(2)),
        profit: Number(r.profit.toFixed(2)),
      };
    });

    // Sort by total amount descending
    rows.sort((a, b) => b.totalAmount - a.totalAmount);

    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.productCode.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.productBarcode.toLowerCase().includes(q) ||
          r.productOfficialName.toLowerCase().includes(q) ||
          (r.category && r.category.toLowerCase().includes(q)) ||
          (r.brand && r.brand.toLowerCase().includes(q)) ||
          (r.customerName && r.customerName.toLowerCase().includes(q))
      );
    }

    return { filterType: 'product_total', isSpecificProduct: false, rows };
  }

  // 3. MONTH WISE ITEMS
  if (filterType === 'month') {
    const invoices = await SalesInvoice.find(filter)
      .select('_id date customerName customerId')
      .populate({ path: 'customerId', select: 'name code' })
      .lean();

    const invoiceIds = invoices.map((i) => i._id);
    const invMetaMap: Record<string, { date: Date; customerName: string }> = {};
    invoices.forEach((i: any) => {
      const cust = i.customerId;
      const custName = i.customerName || cust?.name || 'Walk-in / Cash Customer';
      invMetaMap[i._id.toString()] = {
        date: i.date,
        customerName: custName,
      };
    });

    const itemFilter: Record<string, any> = { invoiceId: { $in: invoiceIds } };
    if (opts.productId && opts.productId !== 'ALL' && mongoose.Types.ObjectId.isValid(opts.productId)) {
      itemFilter.productId = new mongoose.Types.ObjectId(opts.productId);
    }

    const items = await SalesInvoiceItem.find(itemFilter)
      .populate({
        path: 'productId',
        select:
          'code name sku systemBarcode internationalBarcode genericName officialCode purchasePrice vatPercent vatCategory categoryId brand',
        populate: [
          { path: 'categoryId', select: 'name code' },
        ],
      })
      .lean();

    const taxModeMap = await loadPurchaseTaxModeMap(
      companyId,
      items.map((item) => salesItemProductId(item))
    );

    const monthKeySet = new Set<string>();
    const prodMap: Record<string, any> = {};

    for (const item of items) {
      const prod = item.productId as any;
      if (!prod) continue;
      const invMeta = invMetaMap[item.invoiceId.toString()];
      if (!invMeta || !invMeta.date) continue;

      const d = new Date(invMeta.date);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthKeySet.add(monthKey);

      const prodIdStr = prod._id.toString();
      const category = prod.categoryId as any;
      const categoryName = category?.name || '';
      const brand = prod.brand || '';

      if (!prodMap[prodIdStr]) {
        prodMap[prodIdStr] = {
          productId: prodIdStr,
          productCode: item.productCode || prod.code || prod.sku || '',
          productName: prod.name || '',
          itemName: prod.name || '',
          barcode: prod.systemBarcode || prod.internationalBarcode || prod.sku || '',
          productBarcode: prod.systemBarcode || prod.internationalBarcode || prod.sku || '',
          officialName: prod.genericName || prod.officialCode || '',
          productOfficialName: prod.genericName || prod.officialCode || '',
          category: categoryName,
          brand,
          customerNames: new Set<string>(),
          monthlyData: {},
          totalQty: 0,
          totalProfit: 0,
        };
      }

      if (invMeta.customerName) {
        prodMap[prodIdStr].customerNames.add(invMeta.customerName);
      }

      if (!prodMap[prodIdStr].monthlyData[monthKey]) {
        prodMap[prodIdStr].monthlyData[monthKey] = { qty: 0, profit: 0 };
      }

      const qty = Number(item.quantity || 0);
      const totalAmount = Number(item.totalAmount || 0);
      const vat = Number(item.vatAmount || 0);
      const purchaseAmount = grossPurchaseAmountForItem(item, prod, taxModeMap);
      const profit = (totalAmount - vat) - purchaseAmount;

      prodMap[prodIdStr].monthlyData[monthKey].qty += qty;
      prodMap[prodIdStr].monthlyData[monthKey].profit += profit;
      prodMap[prodIdStr].totalQty += qty;
      prodMap[prodIdStr].totalProfit += profit;
    }

    // Sort months chronologically
    const sortedMonthKeys = Array.from(monthKeySet).sort();
    const months = sortedMonthKeys.map((key) => {
      const [year, month] = key.split('-').map(Number);
      const dateObj = new Date(year, month - 1, 1);
      const label = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      return { key, label };
    });

    let rows = Object.values(prodMap).map((p) => {
      const cNames = Array.from(p.customerNames as Set<string>);
      // Round all monthly data
      const roundedMonthly: Record<string, { qty: number; profit: number }> = {};
      for (const m of sortedMonthKeys) {
        const val = p.monthlyData[m] || { qty: 0, profit: 0 };
        roundedMonthly[m] = {
          qty: Number(val.qty.toFixed(2)),
          profit: Number(val.profit.toFixed(2)),
        };
      }
      return {
        productId: p.productId,
        productCode: p.productCode,
        productName: p.productName,
        itemName: p.itemName,
        barcode: p.barcode,
        productBarcode: p.productBarcode,
        officialName: p.officialName,
        productOfficialName: p.productOfficialName,
        category: p.category,
        brand: p.brand,
        customerNames: cNames,
        customerName: cNames.join(', '),
        monthlyData: roundedMonthly,
        totalQty: Number(p.totalQty.toFixed(2)),
        totalProfit: Number(p.totalProfit.toFixed(2)),
      };
    });

    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.itemName.toLowerCase().includes(q) ||
          r.barcode.toLowerCase().includes(q) ||
          r.officialName.toLowerCase().includes(q) ||
          (r.category && r.category.toLowerCase().includes(q)) ||
          (r.brand && r.brand.toLowerCase().includes(q)) ||
          (r.customerName && r.customerName.toLowerCase().includes(q))
      );
    }

    return { filterType: 'month', months, rows };
  }

  // 5. DAILY WISE: AGGREGATED DAILY TOTALS FOR SPECIFIC PERIOD
  if (filterType === 'daily') {
    const invoices = await SalesInvoice.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const invoiceIds = invoices.map((i) => i._id);

    // Fetch items to compute gross (ex-VAT) purchase amount
    const items = await SalesInvoiceItem.find({ invoiceId: { $in: invoiceIds } })
      .populate('productId', 'purchasePrice code name vatPercent vatCategory')
      .lean();

    const taxModeMap = await loadPurchaseTaxModeMap(
      companyId,
      items.map((item) => salesItemProductId(item))
    );
    const invoicePurchaseMap: Record<string, number> = {};
    for (const item of items) {
      const invIdStr = item.invoiceId.toString();
      const prod = item.productId as any;
      invoicePurchaseMap[invIdStr] =
        (invoicePurchaseMap[invIdStr] || 0) + grossPurchaseAmountForItem(item, prod, taxModeMap);
    }

    const dayMap: Record<string, any> = {};

    for (const inv of invoices) {
      const invIdStr = inv._id.toString();
      let dayKey = '';
      if (inv.date) {
        const d = new Date(inv.date);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          dayKey = `${y}-${m}-${day}`;
        }
      }
      if (!dayKey) dayKey = 'Unknown';

      if (!dayMap[dayKey]) {
        dayMap[dayKey] = {
          _id: dayKey,
          date: dayKey,
          grossAmount: 0,
          otherDiscount: 0,
          freightCharge: 0,
          otherCharge: 0,
          travelcharge: 0,
          vatAmount: 0,
          roundoff: 0,
          grandTotal: 0,
          totalPurchaseAmount: 0,
          totalProfit: 0,
          cashReceived: 0,
          cardReceived: 0,
          cashPaid: 0,
          invoiceCount: 0,
        };
      }

      const grossAmount = Number(inv.grossAmount || 0);
      const otherDiscount = Number(inv.otherDiscount || 0);
      const freightCharge = Number(inv.freightCharge || 0);
      const otherCharge = Number(inv.otherCharges || 0);
      const travelcharge = Number(inv.lendAddLess || 0);
      const vatAmount = Number(inv.vatAmount || 0);
      const roundoff = Number(inv.roundOff || 0);
      const grandTotal = Number(inv.totalAmount || 0);
      const totalPurchaseAmount = Number((invoicePurchaseMap[invIdStr] || 0).toFixed(2));
      const totalProfit = Number(((grandTotal - vatAmount) - totalPurchaseAmount).toFixed(2));

      let cashReceived = Number(inv.cashReceived || 0);
      let cardReceived = 0;
      if (Array.isArray(inv.paymentDetails) && inv.paymentDetails.length > 0) {
        for (const pd of inv.paymentDetails) {
          if (/card/i.test(pd.mode)) {
            cardReceived += Number(pd.amount || 0);
          } else if (/cash/i.test(pd.mode) && !inv.cashReceived) {
            cashReceived += Number(pd.amount || 0);
          }
        }
      }
      if (inv.paymentType === 'Cash' && cashReceived === 0 && cardReceived === 0) {
        cashReceived = grandTotal;
      }

      let cashPaid = 0;
      if (inv.type === 'Return') {
        if (inv.paymentType === 'Cash' || inv.cashAccountId || (!inv.customerId && (!inv.paymentDetails || inv.paymentDetails.length === 0))) {
          cashPaid = grandTotal;
        } else if (inv.cashReceived) {
          cashPaid = Number(inv.cashReceived);
        }
      }

      const dRecord = dayMap[dayKey];
      dRecord.grossAmount += grossAmount;
      dRecord.otherDiscount += otherDiscount;
      dRecord.freightCharge += freightCharge;
      dRecord.otherCharge += otherCharge;
      dRecord.travelcharge += travelcharge;
      dRecord.vatAmount += vatAmount;
      dRecord.roundoff += roundoff;
      dRecord.grandTotal += grandTotal;
      dRecord.totalPurchaseAmount += totalPurchaseAmount;
      dRecord.totalProfit += totalProfit;
      dRecord.cashReceived += cashReceived;
      dRecord.cardReceived += cardReceived;
      dRecord.cashPaid += cashPaid;
      dRecord.invoiceCount += 1;
    }

    let rows = Object.values(dayMap).map((r: any) => ({
      _id: r._id,
      date: r.date,
      grossAmount: Number(r.grossAmount.toFixed(2)),
      otherDiscount: Number(r.otherDiscount.toFixed(2)),
      freightCharge: Number(r.freightCharge.toFixed(2)),
      otherCharge: Number(r.otherCharge.toFixed(2)),
      travelcharge: Number(r.travelcharge.toFixed(2)),
      vatAmount: Number(r.vatAmount.toFixed(2)),
      roundoff: Number(r.roundoff.toFixed(2)),
      grandTotal: Number(r.grandTotal.toFixed(2)),
      totalPurchaseAmount: Number(r.totalPurchaseAmount.toFixed(2)),
      totalProfit: Number(r.totalProfit.toFixed(2)),
      cashReceived: Number(r.cashReceived.toFixed(2)),
      cardReceived: Number(r.cardReceived.toFixed(2)),
      cashPaid: Number(r.cashPaid.toFixed(2)),
      invoiceCount: r.invoiceCount,
    }));

    // Sort by date descending (most recent first)
    rows.sort((a, b) => b.date.localeCompare(a.date));

    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim().toLowerCase();
      rows = rows.filter((r) => r.date.toLowerCase().includes(q));
    }

    return { filterType: 'daily', rows };
  }

  // 6. MONTH WISE: AGGREGATED MONTHLY TOTALS FOR SPECIFIC PERIOD
  if (filterType === 'monthly') {
    const invoices = await SalesInvoice.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const invoiceIds = invoices.map((i) => i._id);

    // Fetch items to compute gross (ex-VAT) purchase amount
    const items = await SalesInvoiceItem.find({ invoiceId: { $in: invoiceIds } })
      .populate('productId', 'purchasePrice code name vatPercent vatCategory')
      .lean();

    const taxModeMap = await loadPurchaseTaxModeMap(
      companyId,
      items.map((item) => salesItemProductId(item))
    );
    const invoicePurchaseMap: Record<string, number> = {};
    for (const item of items) {
      const invIdStr = item.invoiceId.toString();
      const prod = item.productId as any;
      invoicePurchaseMap[invIdStr] =
        (invoicePurchaseMap[invIdStr] || 0) + grossPurchaseAmountForItem(item, prod, taxModeMap);
    }

    const monthMap: Record<string, any> = {};

    for (const inv of invoices) {
      const invIdStr = inv._id.toString();
      let monthKey = '';
      let monthLabel = '';
      if (inv.date) {
        const d = new Date(inv.date);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          monthKey = `${y}-${m}`;
          const dateObj = new Date(y, d.getMonth(), 1);
          monthLabel = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        }
      }
      if (!monthKey) {
        monthKey = 'Unknown';
        monthLabel = 'Unknown';
      }

      if (!monthMap[monthKey]) {
        monthMap[monthKey] = {
          _id: monthKey,
          monthKey,
          month: monthLabel,
          grossAmount: 0,
          otherDiscount: 0,
          freightCharge: 0,
          otherCharge: 0,
          travelcharge: 0,
          vatAmount: 0,
          roundoff: 0,
          grandTotal: 0,
          totalPurchaseAmount: 0,
          totalProfit: 0,
          cashReceived: 0,
          cardReceived: 0,
          cashPaid: 0,
          invoiceCount: 0,
        };
      }

      const grossAmount = Number(inv.grossAmount || 0);
      const otherDiscount = Number(inv.otherDiscount || 0);
      const freightCharge = Number(inv.freightCharge || 0);
      const otherCharge = Number(inv.otherCharges || 0);
      const travelcharge = Number(inv.lendAddLess || 0);
      const vatAmount = Number(inv.vatAmount || 0);
      const roundoff = Number(inv.roundOff || 0);
      const grandTotal = Number(inv.totalAmount || 0);
      const totalPurchaseAmount = Number((invoicePurchaseMap[invIdStr] || 0).toFixed(2));
      const totalProfit = Number(((grandTotal - vatAmount) - totalPurchaseAmount).toFixed(2));

      let cashReceived = Number(inv.cashReceived || 0);
      let cardReceived = 0;
      if (Array.isArray(inv.paymentDetails) && inv.paymentDetails.length > 0) {
        for (const pd of inv.paymentDetails) {
          if (/card/i.test(pd.mode)) {
            cardReceived += Number(pd.amount || 0);
          } else if (/cash/i.test(pd.mode) && !inv.cashReceived) {
            cashReceived += Number(pd.amount || 0);
          }
        }
      }
      if (inv.paymentType === 'Cash' && cashReceived === 0 && cardReceived === 0) {
        cashReceived = grandTotal;
      }

      let cashPaid = 0;
      if (inv.type === 'Return') {
        if (inv.paymentType === 'Cash' || inv.cashAccountId || (!inv.customerId && (!inv.paymentDetails || inv.paymentDetails.length === 0))) {
          cashPaid = grandTotal;
        } else if (inv.cashReceived) {
          cashPaid = Number(inv.cashReceived);
        }
      }

      const mRecord = monthMap[monthKey];
      mRecord.grossAmount += grossAmount;
      mRecord.otherDiscount += otherDiscount;
      mRecord.freightCharge += freightCharge;
      mRecord.otherCharge += otherCharge;
      mRecord.travelcharge += travelcharge;
      mRecord.vatAmount += vatAmount;
      mRecord.roundoff += roundoff;
      mRecord.grandTotal += grandTotal;
      mRecord.totalPurchaseAmount += totalPurchaseAmount;
      mRecord.totalProfit += totalProfit;
      mRecord.cashReceived += cashReceived;
      mRecord.cardReceived += cardReceived;
      mRecord.cashPaid += cashPaid;
      mRecord.invoiceCount += 1;
    }

    let rows = Object.values(monthMap).map((r: any) => ({
      _id: r._id,
      monthKey: r.monthKey,
      month: r.month,
      grossAmount: Number(r.grossAmount.toFixed(2)),
      otherDiscount: Number(r.otherDiscount.toFixed(2)),
      freightCharge: Number(r.freightCharge.toFixed(2)),
      otherCharge: Number(r.otherCharge.toFixed(2)),
      travelcharge: Number(r.travelcharge.toFixed(2)),
      vatAmount: Number(r.vatAmount.toFixed(2)),
      roundoff: Number(r.roundoff.toFixed(2)),
      grandTotal: Number(r.grandTotal.toFixed(2)),
      totalPurchaseAmount: Number(r.totalPurchaseAmount.toFixed(2)),
      totalProfit: Number(r.totalProfit.toFixed(2)),
      cashReceived: Number(r.cashReceived.toFixed(2)),
      cardReceived: Number(r.cardReceived.toFixed(2)),
      cashPaid: Number(r.cashPaid.toFixed(2)),
      invoiceCount: r.invoiceCount,
    }));

    // Sort by monthKey descending (most recent first)
    rows.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim().toLowerCase();
      rows = rows.filter((r) => r.month.toLowerCase().includes(q));
    }

    return { filterType: 'monthly', rows };
  }

  return { filterType, rows: [] };
}


