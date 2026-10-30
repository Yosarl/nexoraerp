import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { PurchaseReturn } from '../models/PurchaseReturn';
import { LedgerAccount } from '../models/LedgerAccount';
import { LedgerGroup } from '../models/LedgerGroup';
import { AppError } from '../middlewares/errorHandler';
import * as voucherService from './voucherService';

const VAT_RATE = 5;

// ─── Helpers ───────────────────────────────────────────────

async function findOrCreateGroup(companyId: string, type: string) {
  let group = await LedgerGroup.findOne({ companyId, type });
  if (group) return group;
  const lastGrp = await LedgerGroup.findOne({ companyId, code: /^GRP/ }).sort({ code: -1 }).lean();
  const num = lastGrp?.code ? parseInt(lastGrp.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `GRP${num.toString().padStart(4, '0')}`;
  group = await LedgerGroup.create({ companyId, name: `${type} Group`, code, type });
  return group;
}

async function findOrCreateSpecialLedger(
  companyId: string,
  name: string,
  type: 'Revenue' | 'Expense' | 'Other',
  groupType: string,
) {
  let ledger = await LedgerAccount.findOne({ companyId, name });
  if (ledger) return ledger;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  ledger = await LedgerAccount.findOne({ companyId, name: new RegExp(`^${escaped}$`, 'i') });
  if (ledger) return ledger;
  const group = await findOrCreateGroup(companyId, groupType);
  const lastAcc = await LedgerAccount.findOne({ companyId, code: /^ACC/ }).sort({ code: -1 }).lean();
  const num = lastAcc?.code ? parseInt(lastAcc.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `ACC${num.toString().padStart(4, '0')}`;
  ledger = await LedgerAccount.create({ companyId, name, code, type, groupId: group._id });
  return ledger;
}

async function findOrCreatePurchaseReturnLedger(companyId: string) {
  return findOrCreateSpecialLedger(companyId, 'Purchase Returns', 'Revenue', 'Income');
}

async function findOrCreateVatInputLedger(companyId: string) {
  let ledger = await LedgerAccount.findOne({ companyId, name: 'VAT Receivable' });
  if (ledger) return ledger;
  ledger = await LedgerAccount.findOne({ companyId, name: /^vat\s*(receivable|input)$/i });
  if (ledger) return ledger;
  let group = await LedgerGroup.findOne({ companyId, name: /duties and taxes receivable/i, parentGroupId: { $ne: null } });
  if (!group) {
    group = await LedgerGroup.findOne({ companyId, name: /duties and taxes receivable/i });
  }
  if (!group) {
    group = await findOrCreateGroup(companyId, 'Asset');
  }
  const lastAcc = await LedgerAccount.findOne({ companyId, code: /^ACC/ }).sort({ code: -1 }).lean();
  const num = lastAcc?.code ? parseInt(lastAcc.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `ACC${num.toString().padStart(4, '0')}`;
  ledger = await LedgerAccount.create({
    companyId, name: 'VAT Receivable', code, type: 'Other',
    groupId: group._id,
  });
  return ledger;
}

// ─── Interfaces ─────────────────────────────────────────────

export type PurchaseReturnType = 'OnAccount' | 'ByRef';

export interface PurchaseReturnItemInput {
  productId: string;
  productCode?: string;
  productName?: string;
  quantity: number;
  purchasePrice: number;
  discAmount?: number;
  batchNumber?: string;
  unitId?: string;
  unitName?: string;
  multiUnitId?: string;
}

export interface CreatePurchaseReturnInput {
  companyId: string;
  financialYearId: string;
  date?: string;
  returnType: PurchaseReturnType;
  originalPurchaseId?: string;
  supplierId?: string;
  supplierName?: string;
  supplierInvoiceNo?: string;
  cashAccountId?: string;
  vatType?: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  items: PurchaseReturnItemInput[];
  itemsDiscount?: number;
  otherDiscount?: number;
  otherCharges?: number;
  freightCharge?: number;
  roundOff?: number;
  narration?: string;
  createdBy?: string;
}

// ─── Get next return invoice number ─────────────────────────

export async function getNextReturnInvoiceNo(companyId: string, financialYearId: string): Promise<string> {
  const prefix = 'PR';
  const last = await PurchaseReturn.findOne({ companyId, financialYearId })
    .sort({ invoiceNo: -1 })
    .select('invoiceNo')
    .lean();
  if (!last?.invoiceNo) return `${prefix}-000001`;
  const match = last.invoiceNo.match(/-(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${num.toString().padStart(6, '0')}`;
}

// ─── List ──────────────────────────────────────────────────

export async function listPurchaseReturns(companyId: string, financialYearId: string) {
  const list = await PurchaseReturn.find({ companyId, financialYearId })
    .sort({ date: 1, createdAt: 1 })
    .limit(500)
    .lean();
  return list.map((doc) => ({
    _id: doc._id.toString(),
    invoiceNo: doc.invoiceNo,
    date: doc.date,
    supplierName: doc.supplierName,
    totalAmount: doc.totalAmount,
  }));
}

// ─── Create ────────────────────────────────────────────────

export async function createPurchaseReturn(input: CreatePurchaseReturnInput): Promise<{ returnId: string; invoiceNo: string }> {
  if (input.returnType === 'ByRef' && !input.originalPurchaseId) {
    throw new AppError('Original purchase is required when return type is By Ref', 400);
  }
  if (!input.items || input.items.length === 0) {
    throw new AppError('At least one item is required', 400);
  }

  const returnDate = input.date ? new Date(input.date) : new Date();
  const isVat = (input.vatType || 'Vat') === 'Vat';
  const taxMode = input.taxMode ?? 'inclusive';

  let itemsGross = 0;
  let itemsDiscount = 0;
  const itemDocs: Array<{
    productId: mongoose.Types.ObjectId;
    productCode: string;
    productName: string;
    batchNumber: string;
    quantity: number;
    purchasePrice: number;
    discAmount: number;
    unitId?: string;
    unitName?: string;
    multiUnitId?: string;
  }> = [];

  for (const it of input.items) {
    const product = await Product.findById(it.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${it.productId}`, 404);
    }
    const qty = it.quantity;
    const price = it.purchasePrice;
    const disc = it.discAmount ?? 0;
    const gross = qty * price;
    const net = gross - disc;
    itemsGross += gross;
    itemsDiscount += disc;
    itemDocs.push({
      productId: product._id,
      productCode: it.productCode ?? product.code ?? '',
      productName: it.productName ?? product.name ?? '',
      batchNumber: it.batchNumber ?? '',
      quantity: qty,
      purchasePrice: price,
      discAmount: disc,
      unitId: it.unitId,
      unitName: it.unitName,
      multiUnitId: it.multiUnitId,
    });
  }

  const netAmountBeforeAdjustments = itemsGross - itemsDiscount;
  let itemsVat = 0;
  if (isVat) {
    if (taxMode === 'inclusive') {
      itemsVat = parseFloat((netAmountBeforeAdjustments * VAT_RATE / (100 + VAT_RATE)).toFixed(2));
    } else {
      itemsVat = parseFloat((netAmountBeforeAdjustments * VAT_RATE / 100).toFixed(2));
    }
  }

  const otherDiscount = input.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? 0;
  const roundOff = input.roundOff ?? 0;
  const netAdjustments = otherCharges + freightCharge + roundOff - otherDiscount;
  const vatFromAdjustments = isVat && netAdjustments !== 0
    ? parseFloat((netAdjustments * VAT_RATE / (100 + VAT_RATE)).toFixed(2))
    : 0;
  const totalVat = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));
  const subTotalBeforeAdjustments = (taxMode === 'inclusive' && isVat) ? netAmountBeforeAdjustments : (netAmountBeforeAdjustments + itemsVat);
  const grandTotal = subTotalBeforeAdjustments - otherDiscount + otherCharges + freightCharge + roundOff;

  const netFactor = isVat ? 100 / (100 + VAT_RATE) : 1;
  const otherDiscountNet = parseFloat((otherDiscount * netFactor).toFixed(2));
  const otherChargesNet = parseFloat((otherCharges * netFactor).toFixed(2));
  const freightChargeNet = parseFloat((freightCharge * netFactor).toFixed(2));
  const roundOffNet = parseFloat((roundOff * netFactor).toFixed(2));
  const netAdjustmentsNet = otherChargesNet + freightChargeNet - otherDiscountNet + roundOffNet;

  const invoiceNo = await getNextReturnInvoiceNo(input.companyId, input.financialYearId);

  const doc = await PurchaseReturn.create({
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    invoiceNo,
    date: returnDate,
    returnType: input.returnType,
    originalPurchaseId: input.returnType === 'ByRef' && input.originalPurchaseId
      ? new mongoose.Types.ObjectId(input.originalPurchaseId)
      : undefined,
    supplierId: input.supplierId ? new mongoose.Types.ObjectId(input.supplierId) : undefined,
    supplierName: input.supplierName,
    supplierInvoiceNo: input.supplierInvoiceNo,
    cashAccountId: input.cashAccountId ? new mongoose.Types.ObjectId(input.cashAccountId) : undefined,
    vatType: input.vatType || 'Vat',
    taxMode: input.taxMode ?? 'inclusive',
    narration: input.narration ?? (input.returnType === 'ByRef' && input.originalPurchaseId ? `Purchase Return against ${input.originalPurchaseId}` : 'Purchase Return'),
    items: itemDocs,
    totalAmount: grandTotal,
    itemsDiscount,
    otherDiscount,
    otherCharges,
    freightCharge,
    roundOff,
    createdBy: input.createdBy ? new mongoose.Types.ObjectId(input.createdBy) : undefined,
  });

  const returnId = doc._id.toString();

  // Inventory: reduce stock (PurchaseReturn = quantityOut)
  for (const line of itemDocs) {
    let stockQtyOut = line.quantity;
    if (line.multiUnitId) {
      const prod = await Product.findById(line.productId).lean();
      if (prod?.multiUnits) {
        const mu = prod.multiUnits.find((m: { multiUnitId?: string }) => m.multiUnitId === line.multiUnitId);
        if (mu && (mu as { conversion?: number }).conversion && (mu as { conversion: number }).conversion > 0) {
          stockQtyOut = line.quantity * (mu as { conversion: number }).conversion;
        }
      }
    }
    await InventoryTransaction.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      productId: line.productId,
      date: returnDate,
      type: 'PurchaseReturn',
      quantityIn: 0,
      quantityOut: stockQtyOut,
      costPrice: line.purchasePrice - (line.discAmount / line.quantity),
      referenceType: 'PurchaseReturn',
      referenceId: doc._id,
      narration: `Purchase Return ${invoiceNo}`,
      createdBy: input.createdBy ? new mongoose.Types.ObjectId(input.createdBy) : undefined,
    });
  }

  // Ledger: Credit Purchase Returns, Credit VAT Input; Debit Supplier (and adjustment ledgers)
  const purchaseReturnLedger = await findOrCreatePurchaseReturnLedger(input.companyId);
  const vatLedger = isVat && totalVat > 0 ? await findOrCreateVatInputLedger(input.companyId) : null;
  const supplierLedger = input.supplierId
    ? await LedgerAccount.findById(input.supplierId)
    : null;
  const cashLedger = input.cashAccountId ? await LedgerAccount.findById(input.cashAccountId) : null;
  const debitLedger = supplierLedger || cashLedger;

  if (debitLedger) {
    const purchaseReturnNet = isVat && taxMode === 'inclusive'
      ? parseFloat((netAmountBeforeAdjustments - itemsVat).toFixed(2))
      : netAmountBeforeAdjustments;

    const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];

    // Credit Purchase Returns (reduces purchase expense)
    voucherLines.push({
      ledgerAccountId: purchaseReturnLedger._id.toString(),
      debitAmount: 0,
      creditAmount: purchaseReturnNet,
      narration: `Purchase Return ${invoiceNo}`,
    });

    // Credit VAT Input (reversal)
    if (vatLedger && totalVat > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: 0,
        creditAmount: totalVat,
        narration: `Purchase Return ${invoiceNo} - VAT Reversal`,
      });
    }

    // Debit Supplier/Cash (we get refund / reduce payable)
    voucherLines.push({
      ledgerAccountId: debitLedger._id.toString(),
      debitAmount: grandTotal,
      creditAmount: 0,
      narration: supplierLedger ? `Purchase Return ${invoiceNo}` : `Purchase Return ${invoiceNo} - Cash Refund`,
    });

    // When refund by cash: Debit Cash, Credit Supplier (cash received from supplier)
    if (cashLedger && supplierLedger && input.cashAccountId && input.supplierId) {
      voucherLines.push({
        ledgerAccountId: cashLedger._id.toString(),
        debitAmount: grandTotal,
        creditAmount: 0,
        narration: `Purchase Return ${invoiceNo} - Cash Refund`,
      });
      voucherLines.push({
        ledgerAccountId: supplierLedger._id.toString(),
        debitAmount: 0,
        creditAmount: grandTotal,
        narration: `Purchase Return ${invoiceNo} - Cash Refund`,
      });
    }

    // Adjustment ledgers (reversed from purchase): Debit Other Discount on Purchase, Credit Other Charges, Credit Freight, Round Off
    const otherDiscountLedger = otherDiscount > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Discount on Purchase', 'Revenue', 'Income') : null;
    const otherChargesLedger = otherCharges > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Charges on Purchase', 'Expense', 'Expense') : null;
    const freightChargesLedger = freightCharge > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Freight Charges on Purchase', 'Expense', 'Expense') : null;
    const roundOffLedger = Math.abs(roundOff) > 0.001 ? await findOrCreateSpecialLedger(input.companyId, 'Round Off on Purchase', 'Expense', 'Expense') : null;

    if (otherDiscountLedger && otherDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: otherDiscountLedger._id.toString(),
        debitAmount: otherDiscountNet,
        creditAmount: 0,
        narration: `Purchase Return ${invoiceNo} - Other Discount`,
      });
    }
    if (otherChargesLedger && otherCharges > 0) {
      voucherLines.push({
        ledgerAccountId: otherChargesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: otherChargesNet,
        narration: `Purchase Return ${invoiceNo} - Other Charges`,
      });
    }
    if (freightChargesLedger && freightCharge > 0) {
      voucherLines.push({
        ledgerAccountId: freightChargesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: freightChargeNet,
        narration: `Purchase Return ${invoiceNo} - Freight`,
      });
    }
    if (roundOffLedger && Math.abs(roundOff) > 0.001) {
      voucherLines.push({
        ledgerAccountId: roundOffLedger._id.toString(),
        debitAmount: roundOffNet < 0 ? Math.abs(roundOffNet) : 0,
        creditAmount: roundOffNet > 0 ? roundOffNet : 0,
        narration: `Purchase Return ${invoiceNo} - Round Off`,
      });
    }

    let totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    let totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01) {
      if (totalDebit > totalCredit) {
        voucherLines[0].creditAmount = (voucherLines[0].creditAmount || 0) + diff;
      } else {
        voucherLines[0].creditAmount = (voucherLines[0].creditAmount || 0) - diff;
      }
    }

    const v = await voucherService.createAndPost({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      voucherType: 'Journal',
      date: returnDate,
      lines: voucherLines,
      narration: `Purchase Return ${invoiceNo}`,
      createdBy: input.createdBy,
    });
    await PurchaseReturn.updateOne({ _id: doc._id }, { voucherId: v._id });
  }

  return { returnId, invoiceNo };
}

// ─── Update ───────────────────────────────────────────────

export async function updatePurchaseReturn(
  returnId: string,
  companyId: string,
  input: CreatePurchaseReturnInput
): Promise<{ returnId: string; invoiceNo: string }> {
  const doc = await PurchaseReturn.findOne({ _id: returnId, companyId });
  if (!doc) throw new AppError('Purchase return not found', 404);
  if (input.returnType === 'ByRef' && !input.originalPurchaseId) {
    throw new AppError('Original purchase is required when return type is By Ref', 400);
  }
  if (!input.items || input.items.length === 0) {
    throw new AppError('At least one item is required', 400);
  }

  const invoiceNo = doc.invoiceNo;

  // Reverse existing ledger
  if (doc.voucherId) {
    const { LedgerEntry } = await import('../models/LedgerEntry');
    await LedgerEntry.deleteMany({ voucherId: doc.voucherId });
    await voucherService.deleteVoucher(doc.voucherId.toString());
  }
  await InventoryTransaction.deleteMany({ referenceType: 'PurchaseReturn', referenceId: doc._id });

  const returnDate = input.date ? new Date(input.date) : new Date();
  const isVat = (input.vatType || 'Vat') === 'Vat';
  const taxMode = input.taxMode ?? 'inclusive';

  let itemsGross = 0;
  let itemsDiscount = 0;
  const itemDocs: Array<{
    productId: mongoose.Types.ObjectId;
    productCode: string;
    productName: string;
    batchNumber: string;
    quantity: number;
    purchasePrice: number;
    discAmount: number;
    unitId?: string;
    unitName?: string;
    multiUnitId?: string;
  }> = [];

  for (const it of input.items) {
    const product = await Product.findById(it.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${it.productId}`, 404);
    }
    const qty = it.quantity;
    const price = it.purchasePrice;
    const disc = it.discAmount ?? 0;
    const gross = qty * price;
    const net = gross - disc;
    itemsGross += gross;
    itemsDiscount += disc;
    itemDocs.push({
      productId: product._id,
      productCode: it.productCode ?? product.code ?? '',
      productName: it.productName ?? product.name ?? '',
      batchNumber: it.batchNumber ?? '',
      quantity: qty,
      purchasePrice: price,
      discAmount: disc,
      unitId: it.unitId,
      unitName: it.unitName,
      multiUnitId: it.multiUnitId,
    });
  }

  const netAmountBeforeAdjustments = itemsGross - itemsDiscount;
  let itemsVat = 0;
  if (isVat) {
    if (taxMode === 'inclusive') {
      itemsVat = parseFloat((netAmountBeforeAdjustments * VAT_RATE / (100 + VAT_RATE)).toFixed(2));
    } else {
      itemsVat = parseFloat((netAmountBeforeAdjustments * VAT_RATE / 100).toFixed(2));
    }
  }

  const otherDiscount = input.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? 0;
  const roundOff = input.roundOff ?? 0;
  const netAdjustments = otherCharges + freightCharge + roundOff - otherDiscount;
  const vatFromAdjustments = isVat && netAdjustments !== 0
    ? parseFloat((netAdjustments * VAT_RATE / (100 + VAT_RATE)).toFixed(2))
    : 0;
  const totalVat = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));
  const subTotalBeforeAdjustments = (taxMode === 'inclusive' && isVat) ? netAmountBeforeAdjustments : (netAmountBeforeAdjustments + itemsVat);
  const grandTotal = subTotalBeforeAdjustments - otherDiscount + otherCharges + freightCharge + roundOff;

  const netFactor = isVat ? 100 / (100 + VAT_RATE) : 1;
  const otherDiscountNet = parseFloat((otherDiscount * netFactor).toFixed(2));
  const otherChargesNet = parseFloat((otherCharges * netFactor).toFixed(2));
  const freightChargeNet = parseFloat((freightCharge * netFactor).toFixed(2));
  const roundOffNet = parseFloat((roundOff * netFactor).toFixed(2));

  await PurchaseReturn.updateOne(
    { _id: returnId, companyId },
    {
      $set: {
        date: returnDate,
        returnType: input.returnType,
        originalPurchaseId: input.returnType === 'ByRef' && input.originalPurchaseId
          ? new mongoose.Types.ObjectId(input.originalPurchaseId)
          : null,
        supplierId: input.supplierId ? new mongoose.Types.ObjectId(input.supplierId) : null,
        supplierName: input.supplierName,
        supplierInvoiceNo: input.supplierInvoiceNo,
        cashAccountId: input.cashAccountId ? new mongoose.Types.ObjectId(input.cashAccountId) : null,
        vatType: input.vatType || 'Vat',
        taxMode: input.taxMode ?? 'inclusive',
        narration: input.narration ?? (input.returnType === 'ByRef' && input.originalPurchaseId ? `Purchase Return against ${input.originalPurchaseId}` : 'Purchase Return'),
        items: itemDocs,
        totalAmount: grandTotal,
        itemsDiscount,
        otherDiscount,
        otherCharges,
        freightCharge,
        roundOff,
      },
      $unset: { voucherId: 1 },
    }
  );

  for (const line of itemDocs) {
    let stockQtyOut = line.quantity;
    if (line.multiUnitId) {
      const prod = await Product.findById(line.productId).lean();
      if (prod?.multiUnits) {
        const mu = prod.multiUnits.find((m: { multiUnitId?: string }) => m.multiUnitId === line.multiUnitId);
        if (mu && (mu as { conversion?: number }).conversion && (mu as { conversion: number }).conversion > 0) {
          stockQtyOut = line.quantity * (mu as { conversion: number }).conversion;
        }
      }
    }
    await InventoryTransaction.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      productId: line.productId,
      date: returnDate,
      type: 'PurchaseReturn',
      quantityIn: 0,
      quantityOut: stockQtyOut,
      costPrice: line.purchasePrice - (line.discAmount / line.quantity),
      referenceType: 'PurchaseReturn',
      referenceId: doc._id,
      narration: `Purchase Return ${invoiceNo}`,
      createdBy: input.createdBy ? new mongoose.Types.ObjectId(input.createdBy) : undefined,
    });
  }

  const purchaseReturnLedger = await findOrCreatePurchaseReturnLedger(input.companyId);
  const vatLedger = isVat && totalVat > 0 ? await findOrCreateVatInputLedger(input.companyId) : null;
  const supplierLedger = input.supplierId ? await LedgerAccount.findById(input.supplierId) : null;
  const cashLedger = input.cashAccountId ? await LedgerAccount.findById(input.cashAccountId) : null;
  const debitLedger = supplierLedger || cashLedger;

  if (debitLedger) {
    const purchaseReturnNet = isVat && taxMode === 'inclusive'
      ? parseFloat((netAmountBeforeAdjustments - itemsVat).toFixed(2))
      : netAmountBeforeAdjustments;

    const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];
    voucherLines.push({
      ledgerAccountId: purchaseReturnLedger._id.toString(),
      debitAmount: 0,
      creditAmount: purchaseReturnNet,
      narration: `Purchase Return ${invoiceNo}`,
    });
    if (vatLedger && totalVat > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: 0,
        creditAmount: totalVat,
        narration: `Purchase Return ${invoiceNo} - VAT Reversal`,
      });
    }
    voucherLines.push({
      ledgerAccountId: debitLedger._id.toString(),
      debitAmount: grandTotal,
      creditAmount: 0,
      narration: supplierLedger ? `Purchase Return ${invoiceNo}` : `Purchase Return ${invoiceNo} - Cash Refund`,
    });
    if (cashLedger && supplierLedger && input.cashAccountId && input.supplierId) {
      voucherLines.push(
        { ledgerAccountId: cashLedger._id.toString(), debitAmount: grandTotal, creditAmount: 0, narration: `Purchase Return ${invoiceNo} - Cash Refund` },
        { ledgerAccountId: supplierLedger._id.toString(), debitAmount: 0, creditAmount: grandTotal, narration: `Purchase Return ${invoiceNo} - Cash Refund` }
      );
    }

    const otherDiscountLedger = otherDiscount > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Discount on Purchase', 'Revenue', 'Income') : null;
    const otherChargesLedger = otherCharges > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Charges on Purchase', 'Expense', 'Expense') : null;
    const freightChargesLedger = freightCharge > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Freight Charges on Purchase', 'Expense', 'Expense') : null;
    const roundOffLedger = Math.abs(roundOff) > 0.001 ? await findOrCreateSpecialLedger(input.companyId, 'Round Off on Purchase', 'Expense', 'Expense') : null;

    if (otherDiscountLedger && otherDiscount > 0) {
      voucherLines.push({ ledgerAccountId: otherDiscountLedger._id.toString(), debitAmount: otherDiscountNet, creditAmount: 0, narration: `Purchase Return ${invoiceNo} - Other Discount` });
    }
    if (otherChargesLedger && otherCharges > 0) {
      voucherLines.push({ ledgerAccountId: otherChargesLedger._id.toString(), debitAmount: 0, creditAmount: otherChargesNet, narration: `Purchase Return ${invoiceNo} - Other Charges` });
    }
    if (freightChargesLedger && freightCharge > 0) {
      voucherLines.push({ ledgerAccountId: freightChargesLedger._id.toString(), debitAmount: 0, creditAmount: freightChargeNet, narration: `Purchase Return ${invoiceNo} - Freight` });
    }
    if (roundOffLedger && Math.abs(roundOff) > 0.001) {
      voucherLines.push({
        ledgerAccountId: roundOffLedger._id.toString(),
        debitAmount: roundOffNet < 0 ? Math.abs(roundOffNet) : 0,
        creditAmount: roundOffNet > 0 ? roundOffNet : 0,
        narration: `Purchase Return ${invoiceNo} - Round Off`,
      });
    }

    let totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    let totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01) {
      if (totalDebit > totalCredit) {
        voucherLines[0].creditAmount = (voucherLines[0].creditAmount || 0) + diff;
      } else {
        voucherLines[0].creditAmount = (voucherLines[0].creditAmount || 0) - diff;
      }
    }

    const v = await voucherService.createAndPost({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      voucherType: 'Journal',
      date: returnDate,
      lines: voucherLines,
      narration: `Purchase Return ${invoiceNo}`,
      createdBy: input.createdBy,
    });
    await PurchaseReturn.updateOne({ _id: returnId, companyId }, { voucherId: v._id });
  }

  return { returnId, invoiceNo };
}

// ─── Get by ID ────────────────────────────────────────────

export async function getPurchaseReturnById(returnId: string, companyId: string) {
  let doc = mongoose.Types.ObjectId.isValid(returnId)
    ? await PurchaseReturn.findById(returnId)
        .populate('supplierId', 'name code')
        .populate('cashAccountId', 'name code')
        .lean()
    : null;

  if ((!doc || doc.companyId.toString() !== companyId) && mongoose.Types.ObjectId.isValid(returnId)) {
    doc = await PurchaseReturn.findOne({ voucherId: new mongoose.Types.ObjectId(returnId), companyId })
      .populate('supplierId', 'name code')
      .populate('cashAccountId', 'name code')
      .lean();
  }

  if (!doc || doc.companyId.toString() !== companyId) {
    doc = await PurchaseReturn.findOne({ invoiceNo: returnId, companyId })
      .populate('supplierId', 'name code')
      .populate('cashAccountId', 'name code')
      .lean();
  }

  if (!doc || doc.companyId.toString() !== companyId) return null;
  const supplier = doc.supplierId as unknown as { _id: string; name?: string; code?: string } | null;
  const cashAccount = doc.cashAccountId as unknown as { _id: string; name?: string } | null;
  return {
    _id: doc._id.toString(),
    invoiceNo: doc.invoiceNo,
    date: doc.date.toISOString().split('T')[0],
    returnType: doc.returnType,
    originalPurchaseId: doc.originalPurchaseId?.toString(),
    supplierId: supplier?._id?.toString() ?? doc.supplierId?.toString() ?? '',
    supplierName: doc.supplierName ?? (supplier?.name ?? ''),
    supplierInvoiceNo: doc.supplierInvoiceNo ?? '',
    cashAccountId: cashAccount?._id?.toString() ?? doc.cashAccountId?.toString() ?? '',
    vatType: doc.vatType ?? 'Vat',
    taxMode: doc.taxMode ?? 'inclusive',
    narration: doc.narration ?? '',
    totalAmount: doc.totalAmount,
    itemsDiscount: doc.itemsDiscount ?? 0,
    otherDiscount: doc.otherDiscount ?? 0,
    otherCharges: doc.otherCharges ?? 0,
    freightCharge: doc.freightCharge ?? 0,
    roundOff: doc.roundOff ?? 0,
    items: (doc.items || []).map((it: any) => ({
      productId: it.productId.toString(),
      productCode: it.productCode ?? '',
      productName: it.productName ?? '',
      batchNumber: it.batchNumber ?? '',
      quantity: it.quantity,
      purchasePrice: it.purchasePrice,
      discAmount: it.discAmount ?? 0,
      unitId: it.unitId,
      unitName: it.unitName,
      multiUnitId: it.multiUnitId,
    })),
  };
}

// ─── Search by invoice no ──────────────────────────────────

export async function searchPurchaseReturnByInvoiceNo(companyId: string, invoiceNo: string) {
  const doc = await PurchaseReturn.findOne({
    companyId,
    invoiceNo: new RegExp(`^${invoiceNo.trim()}$`, 'i'),
  }).lean();
  if (!doc) return null;
  return getPurchaseReturnById(doc._id.toString(), companyId);
}

// ─── Delete ────────────────────────────────────────────────

export async function deletePurchaseReturn(returnId: string, companyId: string): Promise<boolean> {
  const doc = await PurchaseReturn.findOne({ _id: returnId, companyId });
  if (!doc) return false;
  if (doc.voucherId) {
    const { LedgerEntry } = await import('../models/LedgerEntry');
    await LedgerEntry.deleteMany({ voucherId: doc.voucherId });
    await voucherService.deleteVoucher(doc.voucherId.toString());
  }
  await InventoryTransaction.deleteMany({ referenceType: 'PurchaseReturn', referenceId: returnId });
  const result = await PurchaseReturn.deleteOne({ _id: returnId, companyId });
  return result.deletedCount > 0;
}
