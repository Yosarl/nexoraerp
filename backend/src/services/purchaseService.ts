import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { PurchaseInvoice } from '../models/PurchaseInvoice';
import { PurchaseOrder } from '../models/PurchaseOrder';
import { PurchaseReturn } from '../models/PurchaseReturn';
import { OpeningPurchaseEntry } from '../models/OpeningPurchaseEntry';
import { Company } from '../models/Company';
import { BatchSequence } from '../models/BatchSequence';
import { LedgerAccount } from '../models/LedgerAccount';
import { LedgerGroup } from '../models/LedgerGroup';
import { User } from '../models/User';
import { ProductCategory } from '../models/ProductCategory';
import { UnitOfMeasure } from '../models/UnitOfMeasure';
import { AppError, isDuplicateKeyError } from '../middlewares/errorHandler';
import * as voucherService from './voucherService';
import * as billReferenceService from './billReferenceService';

/** Get next batch number for company (00001, 00002, ...). */
export async function getNextBatchNumber(companyId: string): Promise<string> {
  const companyOid = new mongoose.Types.ObjectId(companyId);
  const doc = await BatchSequence.findOneAndUpdate(
    { companyId: companyOid },
    { $inc: { lastValue: 1 } },
    { new: true, upsert: true }
  ).lean();
  const value = doc?.lastValue ?? 1;
  return value.toString().padStart(5, '0');
}

export interface PurchaseBatchInput {
  productId: string;
  productCode?: string;
  productName?: string;
  purchasePrice: number;
  expiryDate?: string;
  quantity: number;
  discAmount?: number;
  retail?: number;
  wholesale?: number;
  specialPrice1?: number;
  specialPrice2?: number;
  batchNumber?: string;
  multiUnitId?: string;
}

export interface CreatePurchaseInput {
  companyId: string;
  financialYearId: string;
  invoiceNo: string;
  supplierInvoiceNo?: string;
  date?: string;
  supplierId?: string;
  supplierName?: string;
  paymentType?: 'Cash' | 'Credit';
  cashAccountId?: string;
  vatType?: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  narration?: string;
  batches: PurchaseBatchInput[];
  itemsDiscount?: number;
  otherDiscount?: number;
  otherCharges?: number;
  freightCharge?: number;
  roundOff?: number;
  createdBy?: string;
}

// ─── Helpers ───────────────────────────────────────────────

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
  console.log(`[Auto-created] ${name} ledger: ${code}`);
  return ledger;
}

async function findOrCreatePurchaseLedger(companyId: string) {
  let ledger = await LedgerAccount.findOne({ companyId, name: 'Purchase Account' });
  if (ledger) return ledger;
  ledger = await LedgerAccount.findOne({ companyId, name: /^purchase\s*account$/i });
  if (ledger) return ledger;
  ledger = await LedgerAccount.findOne({ companyId, type: 'Expense', name: /^purchase$/i });
  if (ledger) return ledger;
  const group = await findOrCreateGroup(companyId, 'Expense');
  const lastAcc = await LedgerAccount.findOne({ companyId, code: /^ACC/ }).sort({ code: -1 }).lean();
  const num = lastAcc?.code ? parseInt(lastAcc.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `ACC${num.toString().padStart(4, '0')}`;
  ledger = await LedgerAccount.create({
    companyId, name: 'Purchase Account', code, type: 'Expense',
    groupId: group._id,
  });
  console.log(`[Auto-created] Purchase Account ledger: ${code}`);
  return ledger;
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
  console.log(`[Auto-created] VAT Receivable ledger: ${code}`);
  return ledger;
}

// ─── Create ────────────────────────────────────────────────
export async function createPurchase(input: CreatePurchaseInput): Promise<{
  purchaseId: string;
  invoiceNo: string;
  batchCount: number;
}> {
  if (!input.batches || input.batches.length === 0) {
    throw new AppError('At least one batch/item is required', 400);
  }

  const purchaseDate = input.date ? new Date(input.date) : new Date();
  const purchaseId = new mongoose.Types.ObjectId();

  const itemsDiscount = input.itemsDiscount ?? 0;
  const otherDiscount = input.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? 0;
  const roundOff = input.roundOff ?? 0;

  // 1. Save PurchaseInvoice header + batches (assign batch number 00001, 00002, ... when empty)
  let totalAmount = 0;
  const batchDocs: Array<{
    productId: mongoose.Types.ObjectId;
    productCode: string;
    productName: string;
    batchNumber: string;
    purchasePrice: number;
    quantity: number;
    discAmount: number;
    expiryDate?: Date;
    retail: number;
    wholesale: number;
    specialPrice1: number;
    specialPrice2: number;
    multiUnitId?: string;
  }> = [];
  for (const b of input.batches) {
    const gross = b.quantity * b.purchasePrice;
    const disc = b.discAmount ?? 0;
    totalAmount += gross - disc;
    const hasBatchOrExpiry = !!(b.batchNumber?.trim() || b.expiryDate);
    const batchNumber = hasBatchOrExpiry
      ? (b.batchNumber?.trim() || await getNextBatchNumber(input.companyId))
      : '';
    batchDocs.push({
      productId: new mongoose.Types.ObjectId(b.productId),
      productCode: b.productCode || '',
      productName: b.productName || '',
      batchNumber,
      purchasePrice: b.purchasePrice,
      quantity: b.quantity,
      discAmount: disc,
      expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
      retail: b.retail ?? 0,
      wholesale: b.wholesale ?? 0,
      specialPrice1: b.specialPrice1 ?? 0,
      specialPrice2: b.specialPrice2 ?? 0,
      multiUnitId: b.multiUnitId || undefined,
    });
  }

  // Ensure unique invoiceNo to avoid duplicate key conflicts
  let invoiceNo = input.invoiceNo?.trim();
  if (!invoiceNo || await PurchaseInvoice.exists({ companyId: input.companyId, invoiceNo })) {
    invoiceNo = await getNextInvoiceNo(input.companyId);
  }

  const invoicePayload = {
    _id: purchaseId,
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    supplierInvoiceNo: input.supplierInvoiceNo,
    date: purchaseDate,
    supplierId: input.supplierId ? new mongoose.Types.ObjectId(input.supplierId) : undefined,
    supplierName: input.supplierName,
    paymentType: input.paymentType,
    cashAccountId: input.cashAccountId ? new mongoose.Types.ObjectId(input.cashAccountId) : undefined,
    vatType: input.vatType || 'Vat',
    taxMode: input.taxMode ?? 'inclusive',
    narration: input.narration,
    batches: batchDocs,
    totalAmount,
    itemsDiscount,
    otherDiscount,
    otherCharges,
    freightCharge,
    roundOff,
    createdBy: input.createdBy ? new mongoose.Types.ObjectId(input.createdBy) : undefined,
  };

  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await PurchaseInvoice.create({ ...invoicePayload, invoiceNo });
      break;
    } catch (err) {
      if (!isDuplicateKeyError(err) || attempt === 7) throw err;
      invoiceNo = await getNextInvoiceNo(input.companyId);
    }
  }

  // 2. Create InventoryTransaction per batch + update product prices
  for (let i = 0; i < input.batches.length; i++) {
    const batch = input.batches[i];
    const batchDoc = batchDocs[i];
    const product = await Product.findById(batch.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${batch.productId}`, 404);
    }

    // Calculate effective purchase rate: Price - (Discount / Qty)
    const batchDiscAmount = batch.discAmount ?? 0;
    const effectivePurchasePrice = batch.quantity > 0
      ? batch.purchasePrice - (batchDiscAmount / batch.quantity)
      : batch.purchasePrice;

    // For multi-unit purchases, add stock by conversion (pcs inside) instead of line qty
    // and calculate per-piece cost price
    let stockQtyIn = batch.quantity;
    let perPieceCost = effectivePurchasePrice;
    if (batch.multiUnitId && product.multiUnits) {
      const mu = product.multiUnits.find((m) => m.multiUnitId === batch.multiUnitId);
      if (mu && mu.conversion && mu.conversion > 0) {
        stockQtyIn = batch.quantity * mu.conversion;
        perPieceCost = effectivePurchasePrice / mu.conversion;
      }
    }
    perPieceCost = parseFloat(perPieceCost.toFixed(4));

    await InventoryTransaction.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      productId: batch.productId,
      date: purchaseDate,
      type: 'Purchase',
      quantityIn: stockQtyIn,
      quantityOut: 0,
      costPrice: perPieceCost,
      taxMode: input.taxMode ?? 'inclusive',
      batchNumber: batchDoc.batchNumber || undefined,
      referenceType: 'Purchase',
      referenceId: purchaseId,
      narration: `Purchase ${input.invoiceNo}${batchDoc.batchNumber ? ` Batch: ${batchDoc.batchNumber}` : ''}`,
      createdBy: input.createdBy ? new mongoose.Types.ObjectId(input.createdBy) : undefined,
    });

    // Update product purchase price to effective rate (after discount)
    const priceUpdate: Record<string, unknown> = {};
    if (perPieceCost > 0) {
      priceUpdate.purchasePrice = perPieceCost;
    }
    if (batch.expiryDate) {
      priceUpdate.expiryDate = new Date(batch.expiryDate);
    }

    if (batch.multiUnitId && product.multiUnits) {
      const muUpdate: Record<string, unknown> = {};
      if (batch.wholesale !== undefined && batch.wholesale > 0) {
        muUpdate['multiUnits.$[mu].wholesale'] = batch.wholesale;
      }
      if (batch.retail !== undefined && batch.retail > 0) {
        muUpdate['multiUnits.$[mu].retail'] = batch.retail;
      }
      if (batch.specialPrice1 !== undefined && batch.specialPrice1 > 0) {
        muUpdate['multiUnits.$[mu].specialPrice1'] = batch.specialPrice1;
      }
      if (batch.specialPrice2 !== undefined && batch.specialPrice2 > 0) {
        muUpdate['multiUnits.$[mu].specialPrice2'] = batch.specialPrice2;
      }

      const allUpdates = { ...priceUpdate, ...muUpdate };
      if (Object.keys(allUpdates).length > 0) {
        await Product.updateOne(
          { _id: batch.productId, companyId: input.companyId },
          { $set: allUpdates },
          { arrayFilters: [{ 'mu.multiUnitId': batch.multiUnitId }] }
        );
      }
    } else {
      if (batch.retail !== undefined && batch.retail > 0) {
        priceUpdate.retailPrice = batch.retail;
        priceUpdate.sellingPrice = batch.retail;
      }
      if (batch.wholesale !== undefined && batch.wholesale > 0) {
        priceUpdate.wholesalePrice = batch.wholesale;
        priceUpdate.mrp = batch.wholesale;
      }
      if (batch.specialPrice1 !== undefined && batch.specialPrice1 > 0) {
        priceUpdate.specialPrice = batch.specialPrice1;
      }
      if (batch.specialPrice2 !== undefined && batch.specialPrice2 > 0) {
        priceUpdate.specialPrice2 = batch.specialPrice2;
      }

      if (Object.keys(priceUpdate).length > 0) {
        await Product.updateOne(
          { _id: batch.productId, companyId: input.companyId },
          { $set: priceUpdate }
        );
      }
    }
  }

  // 3. Create voucher/ledger entries — mandatory; rollback purchase if this fails
  try {
    await createPurchaseVoucher(input.companyId, input.financialYearId, purchaseId.toString(), invoiceNo, purchaseDate, input, totalAmount, itemsDiscount, otherDiscount, otherCharges, freightCharge, roundOff);
  } catch (err) {
    await PurchaseInvoice.deleteOne({ _id: purchaseId });
    await InventoryTransaction.deleteMany({ referenceType: 'Purchase', referenceId: purchaseId });
    console.error(`[Purchase ${invoiceNo}] Voucher creation failed — purchase rolled back:`, err);
    throw err;
  }

  // 4. Create bill reference ("New Ref" — payable to supplier)
  if (input.supplierId && totalAmount > 0) {
    try {
      await billReferenceService.createNewRef({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        ledgerAccountId: input.supplierId,
        billNumber: invoiceNo,
        referenceType: 'PurchaseInvoice',
        referenceId: purchaseId.toString(),
        date: purchaseDate,
        amount: totalAmount - itemsDiscount + otherCharges + freightCharge + roundOff - otherDiscount,
        drCr: 'Cr',
        narration: `Purchase ${invoiceNo}`,
      });
    } catch (err) {
      console.error(`[Purchase ${invoiceNo}] Bill reference creation failed:`, err);
    }
  }

  return {
    purchaseId: purchaseId.toString(),
    invoiceNo,
    batchCount: input.batches.length,
  };
}

// ─── Update ────────────────────────────────────────────────
export async function updatePurchase(
  purchaseId: string,
  input: CreatePurchaseInput
): Promise<{ purchaseId: string; invoiceNo: string; batchCount: number }> {
  if (!input.batches || input.batches.length === 0) {
    throw new AppError('At least one batch/item is required', 400);
  }

  const existing = await PurchaseInvoice.findById(purchaseId);
  if (!existing) throw new AppError('Purchase invoice not found', 404);

  const purchaseDate = input.date ? new Date(input.date) : new Date();

  const itemsDiscount = input.itemsDiscount ?? 0;
  const otherDiscount = input.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? 0;
  const roundOff = input.roundOff ?? 0;

  // 1. Delete old inventory transactions for this purchase
  await InventoryTransaction.deleteMany({
    referenceType: 'Purchase',
    referenceId: purchaseId,
  });

  // 1b. Keep old voucher until new one is created (delete after step 4)

  // 2. Update PurchaseInvoice header + batches (assign batch number 00001, 00002, ... when empty)
  let totalAmount = 0;
  const batchDocs: Array<{
    productId: mongoose.Types.ObjectId;
    productCode: string;
    productName: string;
    batchNumber: string;
    purchasePrice: number;
    quantity: number;
    discAmount: number;
    expiryDate?: Date;
    retail: number;
    wholesale: number;
    specialPrice1: number;
    specialPrice2: number;
    multiUnitId?: string;
  }> = [];
  for (const b of input.batches) {
    const gross = b.quantity * b.purchasePrice;
    const disc = b.discAmount ?? 0;
    totalAmount += gross - disc;
    const hasBatchOrExpiry = !!(b.batchNumber?.trim() || b.expiryDate);
    const batchNumber = hasBatchOrExpiry
      ? (b.batchNumber?.trim() || await getNextBatchNumber(input.companyId))
      : '';
    batchDocs.push({
      productId: new mongoose.Types.ObjectId(b.productId),
      productCode: b.productCode || '',
      productName: b.productName || '',
      batchNumber,
      purchasePrice: b.purchasePrice,
      quantity: b.quantity,
      discAmount: disc,
      expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
      retail: b.retail ?? 0,
      wholesale: b.wholesale ?? 0,
      specialPrice1: b.specialPrice1 ?? 0,
      specialPrice2: b.specialPrice2 ?? 0,
      multiUnitId: b.multiUnitId || undefined,
    });
  }

  await PurchaseInvoice.updateOne(
    { _id: purchaseId },
    {
      $set: {
        invoiceNo: input.invoiceNo,
        supplierInvoiceNo: input.supplierInvoiceNo,
        date: purchaseDate,
        supplierId: input.supplierId ? new mongoose.Types.ObjectId(input.supplierId) : undefined,
        supplierName: input.supplierName,
        paymentType: input.paymentType,
        cashAccountId: input.cashAccountId ? new mongoose.Types.ObjectId(input.cashAccountId) : undefined,
        vatType: input.vatType || 'Vat',
        taxMode: input.taxMode ?? 'inclusive',
        narration: input.narration,
        batches: batchDocs,
        totalAmount,
        itemsDiscount,
        otherDiscount,
        otherCharges,
        freightCharge,
        roundOff,
      },
    }
  );

  // 3. Create new inventory transactions + update product prices
  for (let i = 0; i < input.batches.length; i++) {
    const batch = input.batches[i];
    const batchDoc = batchDocs[i];
    const product = await Product.findById(batch.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${batch.productId}`, 404);
    }

    // Calculate effective purchase rate: Price - (Discount / Qty)
    const batchDiscAmount = batch.discAmount ?? 0;
    const effectivePurchasePrice = batch.quantity > 0
      ? batch.purchasePrice - (batchDiscAmount / batch.quantity)
      : batch.purchasePrice;

    let stockQtyIn = batch.quantity;
    let perPieceCost = effectivePurchasePrice;
    if (batch.multiUnitId && product.multiUnits) {
      const mu = product.multiUnits.find((m) => m.multiUnitId === batch.multiUnitId);
      if (mu && mu.conversion && mu.conversion > 0) {
        stockQtyIn = batch.quantity * mu.conversion;
        perPieceCost = effectivePurchasePrice / mu.conversion;
      }
    }
    perPieceCost = parseFloat(perPieceCost.toFixed(4));

    await InventoryTransaction.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      productId: batch.productId,
      date: purchaseDate,
      type: 'Purchase',
      quantityIn: stockQtyIn,
      quantityOut: 0,
      costPrice: perPieceCost,
      taxMode: input.taxMode ?? 'inclusive',
      batchNumber: batchDoc.batchNumber || undefined,
      referenceType: 'Purchase',
      referenceId: purchaseId,
      narration: `Purchase ${input.invoiceNo}${batchDoc.batchNumber ? ` Batch: ${batchDoc.batchNumber}` : ''}`,
      createdBy: input.createdBy ? new mongoose.Types.ObjectId(input.createdBy) : undefined,
    });

    // Update product purchase price to effective rate (after discount)
    const priceUpdate: Record<string, unknown> = {};
    if (perPieceCost > 0) {
      priceUpdate.purchasePrice = perPieceCost;
    }
    if (batch.expiryDate) {
      priceUpdate.expiryDate = new Date(batch.expiryDate);
    }

    if (batch.multiUnitId && product.multiUnits) {
      const muUpdate: Record<string, unknown> = {};
      if (batch.wholesale !== undefined && batch.wholesale > 0) muUpdate['multiUnits.$[mu].wholesale'] = batch.wholesale;
      if (batch.retail !== undefined && batch.retail > 0) muUpdate['multiUnits.$[mu].retail'] = batch.retail;
      if (batch.specialPrice1 !== undefined && batch.specialPrice1 > 0) muUpdate['multiUnits.$[mu].specialPrice1'] = batch.specialPrice1;
      if (batch.specialPrice2 !== undefined && batch.specialPrice2 > 0) muUpdate['multiUnits.$[mu].specialPrice2'] = batch.specialPrice2;
      const allUpdates = { ...priceUpdate, ...muUpdate };
      if (Object.keys(allUpdates).length > 0) {
        await Product.updateOne(
          { _id: batch.productId, companyId: input.companyId },
          { $set: allUpdates },
          { arrayFilters: [{ 'mu.multiUnitId': batch.multiUnitId }] }
        );
      }
    } else {
      if (batch.retail !== undefined && batch.retail > 0) { priceUpdate.retailPrice = batch.retail; priceUpdate.sellingPrice = batch.retail; }
      if (batch.wholesale !== undefined && batch.wholesale > 0) { priceUpdate.wholesalePrice = batch.wholesale; priceUpdate.mrp = batch.wholesale; }
      if (batch.specialPrice1 !== undefined && batch.specialPrice1 > 0) priceUpdate.specialPrice = batch.specialPrice1;
      if (batch.specialPrice2 !== undefined && batch.specialPrice2 > 0) priceUpdate.specialPrice2 = batch.specialPrice2;
      if (Object.keys(priceUpdate).length > 0) {
        await Product.updateOne(
          { _id: batch.productId, companyId: input.companyId },
          { $set: priceUpdate }
        );
      }
    }
  }

  // 4. Create new voucher/ledger entries — mandatory; do not delete old voucher until this succeeds
  const newVoucherId = await createPurchaseVoucher(input.companyId, input.financialYearId, purchaseId, input.invoiceNo, purchaseDate, input, totalAmount, itemsDiscount, otherDiscount, otherCharges, freightCharge, roundOff);
  if (!newVoucherId) {
    throw new AppError('Failed to create ledger voucher for purchase', 500);
  }

  // 4b. Delete old voucher only after new one is created and linked
  if (existing.voucherId && existing.voucherId.toString() !== newVoucherId) {
    try {
      await voucherService.deleteVoucher(existing.voucherId.toString());
    } catch (err) {
      console.error(`[Purchase ${input.invoiceNo}] Old voucher deletion failed:`, err);
    }
  }

  // 5. Update bill reference ("New Ref" — payable to supplier)
  if (input.supplierId && totalAmount > 0) {
    try {
      await billReferenceService.createNewRef({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        ledgerAccountId: input.supplierId,
        billNumber: input.invoiceNo,
        referenceType: 'PurchaseInvoice',
        referenceId: purchaseId,
        date: purchaseDate,
        amount: totalAmount - itemsDiscount + otherCharges + freightCharge + roundOff - otherDiscount,
        drCr: 'Cr',
        narration: `Purchase ${input.invoiceNo}`,
      });
    } catch (err) {
      console.error(`[Purchase ${input.invoiceNo}] Bill reference update failed:`, err);
    }
  }

  return {
    purchaseId,
    invoiceNo: input.invoiceNo,
    batchCount: input.batches.length,
  };
}

// ─── Create Purchase Voucher / Ledger Entries ──────────────
async function createPurchaseVoucher(
  companyId: string,
  financialYearId: string,
  purchaseId: string,
  invoiceNo: string,
  purchaseDate: Date,
  input: CreatePurchaseInput,
  totalAmount: number,
  itemsDiscount: number,
  otherDiscount: number,
  otherCharges: number,
  freightCharge: number,
  roundOff: number,
): Promise<string | null> {
  // Calculate VAT (match frontend: inclusive = extract from amount, exclusive = on top)
  const VAT_RATE = 5;
  const isVat = (input.vatType || 'Vat') === 'Vat';
  const taxMode = input.taxMode ?? 'inclusive';
  const netAmountBeforeAdjustments = totalAmount;
  let itemsVat = 0;
  if (isVat) {
    if (taxMode === 'inclusive') {
      itemsVat = parseFloat((netAmountBeforeAdjustments * VAT_RATE / (100 + VAT_RATE)).toFixed(2));
    } else {
      itemsVat = parseFloat((netAmountBeforeAdjustments * VAT_RATE / 100).toFixed(2));
    }
  }
  // When Vat: adjustments are inclusive — total VAT includes VAT in adjustments; post net to adjustment ledgers
  const netAdjustments = otherCharges + freightCharge + roundOff - otherDiscount;
  const vatFromAdjustments = isVat && netAdjustments !== 0
    ? parseFloat((netAdjustments * VAT_RATE / (100 + VAT_RATE)).toFixed(2))
    : 0;
  const totalVat = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));
  const netFactor = isVat ? 100 / (100 + VAT_RATE) : 1;
  const otherDiscountNet = parseFloat((otherDiscount * netFactor).toFixed(2));
  const otherChargesNet = parseFloat((otherCharges * netFactor).toFixed(2));
  const freightChargeNet = parseFloat((freightCharge * netFactor).toFixed(2));
  const roundOffNet = parseFloat((roundOff * netFactor).toFixed(2));

  // Inclusive: totalAmount is inclusive; Exclusive: totalAmount is net, so add itemsVat for amount owed
  const subTotalBeforeAdjustments = (taxMode === 'inclusive' && isVat) ? netAmountBeforeAdjustments : (netAmountBeforeAdjustments + itemsVat);
  const grandTotal = subTotalBeforeAdjustments - otherDiscount + otherCharges + freightCharge + roundOff;

  // Find or create required ledger accounts
  const purchaseLedger = await findOrCreatePurchaseLedger(companyId);
  const supplierLedger = input.supplierId
    ? await LedgerAccount.findById(input.supplierId)
    : await findOrCreateSpecialLedger(companyId, 'Cash Account', 'Other', 'Asset');

  if (!supplierLedger) {
    throw new AppError('Supplier/Cash ledger not found. Cannot post purchase to ledger.', 400);
  }

  // When payment type is Cash and user selected a Supplier, we pay from cash: Debit Supplier, Credit Cash
  const payFromCash = input.paymentType === 'Cash' && input.cashAccountId && input.supplierId && input.cashAccountId !== input.supplierId;
  const cashLedger = payFromCash ? await LedgerAccount.findById(input.cashAccountId) : null;
  if (payFromCash && !cashLedger) {
    throw new AppError('Cash account not found. Cannot post purchase as cash payment.', 400);
  }

  const vatLedger = isVat && totalVat > 0
    ? await findOrCreateVatInputLedger(companyId) : null;

  // Look up special ledger accounts (only when non-zero)
  const discountOnPurchaseLedger = itemsDiscount > 0
    ? await findOrCreateSpecialLedger(companyId, 'Discount on Purchase', 'Revenue', 'Income') : null;
  const otherDiscountLedger = otherDiscount > 0
    ? await findOrCreateSpecialLedger(companyId, 'Other Discount on Purchase', 'Revenue', 'Income') : null;
  const otherChargesLedger = otherCharges > 0
    ? await findOrCreateSpecialLedger(companyId, 'Other Charges on Purchase', 'Expense', 'Expense') : null;
  const freightChargesLedger = freightCharge > 0
    ? await findOrCreateSpecialLedger(companyId, 'Freight Charges on Purchase', 'Expense', 'Expense') : null;
  const roundOffLedger = Math.abs(roundOff) > 0.001
    ? await findOrCreateSpecialLedger(companyId, 'Round Off on Purchase', 'Expense', 'Expense') : null;

  // Build voucher lines
  const voucherLines: { ledgerAccountId: string; debitAmount: number; creditAmount: number; narration: string }[] = [];

  // Debit: Purchase Account (net purchase amount excluding VAT)
  const purchaseNetAmount = isVat && taxMode === 'inclusive'
    ? parseFloat((netAmountBeforeAdjustments - itemsVat).toFixed(2))
    : netAmountBeforeAdjustments;
  voucherLines.push({
    ledgerAccountId: purchaseLedger._id.toString(),
    debitAmount: purchaseNetAmount,
    creditAmount: 0,
    narration: `Purchase ${invoiceNo}`,
  });

  // Debit: VAT Input/Receivable (total input VAT = items + VAT in adjustments when Vat)
  if (vatLedger && totalVat > 0) {
    voucherLines.push({
      ledgerAccountId: vatLedger._id.toString(),
      debitAmount: totalVat,
      creditAmount: 0,
      narration: `Purchase ${invoiceNo} - VAT Input`,
    });
  }

  // Credit Supplier with grandTotal (records purchase payable)
  voucherLines.push({
    ledgerAccountId: supplierLedger._id.toString(),
    debitAmount: 0,
    creditAmount: grandTotal,
    narration: `Purchase ${invoiceNo}`,
  });

  // When Cash + Supplier: settle payable immediately (same pattern as B2C customer + cash)
  if (payFromCash && cashLedger) {
    voucherLines.push({
      ledgerAccountId: cashLedger._id.toString(),
      debitAmount: 0,
      creditAmount: grandTotal,
      narration: `Purchase ${invoiceNo} - Cash Payment`,
    });
    voucherLines.push({
      ledgerAccountId: supplierLedger._id.toString(),
      debitAmount: grandTotal,
      creditAmount: 0,
      narration: `Purchase ${invoiceNo} - Cash Payment`,
    });
  }

  // Credit: Discount on Purchase (row-level discounts reduce cost)
  if (discountOnPurchaseLedger && itemsDiscount > 0) {
    voucherLines.push({
      ledgerAccountId: discountOnPurchaseLedger._id.toString(),
      debitAmount: 0,
      creditAmount: itemsDiscount,
      narration: `Purchase ${invoiceNo} - Row Discounts`,
    });
  }

  // Credit: Other Discount on Purchase (net = VAT-excluded when Vat)
  if (otherDiscountLedger && otherDiscount > 0) {
    voucherLines.push({
      ledgerAccountId: otherDiscountLedger._id.toString(),
      debitAmount: 0,
      creditAmount: otherDiscountNet,
      narration: `Purchase ${invoiceNo} - Other Discount`,
    });
  }

  // Debit: Other Charges on Purchase (net when Vat)
  if (otherChargesLedger && otherCharges > 0) {
    voucherLines.push({
      ledgerAccountId: otherChargesLedger._id.toString(),
      debitAmount: otherChargesNet,
      creditAmount: 0,
      narration: `Purchase ${invoiceNo} - Other Charges`,
    });
  }

  // Debit: Freight Charges on Purchase (net when Vat)
  if (freightChargesLedger && freightCharge > 0) {
    voucherLines.push({
      ledgerAccountId: freightChargesLedger._id.toString(),
      debitAmount: freightChargeNet,
      creditAmount: 0,
      narration: `Purchase ${invoiceNo} - Freight Charges`,
    });
  }

  // Round Off on Purchase (net when Vat; debit if positive, credit if negative)
  if (roundOffLedger && Math.abs(roundOff) > 0.001) {
    voucherLines.push({
      ledgerAccountId: roundOffLedger._id.toString(),
      debitAmount: roundOffNet > 0 ? roundOffNet : 0,
      creditAmount: roundOffNet < 0 ? Math.abs(roundOffNet) : 0,
      narration: `Purchase ${invoiceNo} - Round Off`,
    });
  }

  // Ensure voucher balances: absorb rounding errors into payment line (cash or supplier credit)
  const totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
  const totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
  const diff = parseFloat((totalDebit - totalCredit).toFixed(2));
  if (Math.abs(diff) > 0.001) {
    if (payFromCash && cashLedger) {
      const cashLine = voucherLines.find((l) => l.ledgerAccountId === cashLedger._id.toString() && l.creditAmount > 0);
      if (cashLine) {
        cashLine.creditAmount = parseFloat((cashLine.creditAmount + diff).toFixed(2));
      } else {
        throw new AppError(`Voucher unbalanced: debit ${totalDebit.toFixed(2)} vs credit ${totalCredit.toFixed(2)}`, 400);
      }
    } else {
      const supplierLine = voucherLines.find((l) => l.ledgerAccountId === supplierLedger._id.toString() && l.creditAmount > 0);
      if (supplierLine) {
        supplierLine.creditAmount = parseFloat((supplierLine.creditAmount + diff).toFixed(2));
      } else {
        throw new AppError(`Voucher unbalanced: debit ${totalDebit.toFixed(2)} vs credit ${totalCredit.toFixed(2)}`, 400);
      }
    }
  }

  // Create voucher
  const v = await voucherService.createAndPost({
    companyId,
    financialYearId,
    voucherType: 'Purchase',
    date: purchaseDate,
    narration: `Purchase ${invoiceNo}`,
    lines: voucherLines,
    referenceType: 'PurchaseInvoice',
    referenceId: purchaseId,
    referenceNo: invoiceNo,
    createdBy: input.createdBy,
  });
  console.log(`[Purchase ${invoiceNo}] Voucher created: ${v.voucherNo}`);

  await PurchaseInvoice.updateOne({ _id: purchaseId }, { $set: { voucherId: v._id } });

  return v._id.toString();
}

// ─── List purchase invoices (for navigation) ──────────────
export async function listPurchases(
  companyId: string,
  financialYearId?: string
): Promise<{ _id: string; invoiceNo: string; date: string; supplierName: string; totalAmount: number }[]> {
  const filter: Record<string, unknown> = { companyId };
  if (financialYearId) filter.financialYearId = financialYearId;

  const docs = await PurchaseInvoice.find(filter)
    .sort({ date: 1, createdAt: 1 })
    .select('invoiceNo date supplierName totalAmount')
    .lean();

  return docs.map((d) => ({
    _id: d._id.toString(),
    invoiceNo: d.invoiceNo,
    date: d.date.toISOString().split('T')[0],
    supplierName: d.supplierName || '',
    totalAmount: d.totalAmount,
  }));
}

// ─── Get single purchase invoice by ID ────────────────────
export async function getPurchaseById(id: string) {
  let doc = mongoose.Types.ObjectId.isValid(id)
    ? await PurchaseInvoice.findById(id)
        .populate('supplierId', 'name code')
        .populate('cashAccountId', 'name code')
        .populate('voucherId', 'voucherNo')
        .lean()
    : null;

  if (!doc && mongoose.Types.ObjectId.isValid(id)) {
    doc = await PurchaseInvoice.findOne({ voucherId: new mongoose.Types.ObjectId(id) })
      .populate('supplierId', 'name code')
      .populate('cashAccountId', 'name code')
      .populate('voucherId', 'voucherNo')
      .lean();
  }

  if (!doc) {
    doc = await PurchaseInvoice.findOne({ invoiceNo: id })
      .populate('supplierId', 'name code')
      .populate('cashAccountId', 'name code')
      .populate('voucherId', 'voucherNo')
      .lean();
  }

  if (!doc) throw new AppError('Purchase invoice not found', 404);
  return formatPurchaseDoc(doc);
}

// ─── Get purchase invoice by invoice number ───────────────
export async function getPurchaseByInvoiceNo(companyId: string, invoiceNo: string) {
  const doc = await PurchaseInvoice.findOne({ companyId, invoiceNo })
    .populate('supplierId', 'name code')
    .populate('cashAccountId', 'name code')
    .populate('voucherId', 'voucherNo')
    .lean();
  if (!doc) throw new AppError('Purchase invoice not found', 404);
  return formatPurchaseDoc(doc);
}

// ─── Get next invoice number ──────────────────────────────
export async function getNextInvoiceNo(companyId: string): Promise<string> {
  const docs = await PurchaseInvoice.find({ companyId })
    .select('invoiceNo')
    .lean();

  let maxNum = 0;
  for (const doc of docs) {
    if (doc.invoiceNo) {
      const match = doc.invoiceNo.match(/PUR-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) {
          maxNum = num;
        }
      }
    }
  }

  const nextNum = maxNum + 1;
  return `PUR-${String(nextNum).padStart(4, '0')}`;
}

// ─── Helper: format Mongo doc for API response ────────────
function formatPurchaseDoc(doc: any) {
  const supplier = doc.supplierId as any;
  const voucher = doc.voucherId as any;
  const cashAccount = doc.cashAccountId as any;
  return {
    _id: doc._id.toString(),
    companyId: doc.companyId.toString(),
    financialYearId: doc.financialYearId.toString(),
    invoiceNo: doc.invoiceNo,
    supplierInvoiceNo: doc.supplierInvoiceNo || '',
    date: doc.date.toISOString().split('T')[0],
    supplierId: supplier && typeof supplier === 'object' ? supplier._id?.toString() : (doc.supplierId?.toString() || ''),
    supplierName: doc.supplierName || (supplier && typeof supplier === 'object' ? supplier.name : '') || '',
    paymentType: doc.paymentType ?? undefined,
    cashAccountId: cashAccount && typeof cashAccount === 'object' ? cashAccount._id?.toString() : (doc.cashAccountId?.toString() || ''),
    vatType: doc.vatType || 'Vat',
    taxMode: doc.taxMode ?? 'inclusive',
    narration: doc.narration || '',
    totalAmount: doc.totalAmount,
    itemsDiscount: doc.itemsDiscount ?? 0,
    otherDiscount: doc.otherDiscount ?? 0,
    otherCharges: doc.otherCharges ?? 0,
    freightCharge: doc.freightCharge ?? 0,
    roundOff: doc.roundOff ?? 0,
    voucherId: doc.voucherId ? doc.voucherId.toString() : undefined,
    voucherNo: voucher && typeof voucher === 'object' ? voucher.voucherNo : undefined,
    batches: (doc.batches || []).map((b: any) => ({
      productId: b.productId.toString(),
      productCode: b.productCode || '',
      productName: b.productName || '',
      batchNumber: b.batchNumber || '',
      purchasePrice: b.purchasePrice,
      quantity: b.quantity,
      discAmount: b.discAmount ?? 0,
      expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString().split('T')[0] : '',
      retail: b.retail ?? 0,
      wholesale: b.wholesale ?? 0,
      specialPrice1: b.specialPrice1 ?? 0,
      specialPrice2: b.specialPrice2 ?? 0,
      multiUnitId: b.multiUnitId || undefined,
    })),
  };
}

// ─── Get batches for a specific product across all purchases & adjustments ─
// Accurately tracks per-batch stock from InventoryTransaction records
export async function getBatchesByProduct(
  companyId: string,
  productId: string
): Promise<{
  batchNumber: string;
  productId: string;
  productName: string;
  purchasePrice: number;
  expiryDate: string;
  quantity: number;
  retail: number;
  wholesale: number;
}[]> {
  const companyOid = new mongoose.Types.ObjectId(companyId);
  const productOid = new mongoose.Types.ObjectId(productId);

  // 1. Get raw purchase batches for metadata (retail, wholesale, purchasePrice, expiryDate)
  const docs = await PurchaseInvoice.find({
    companyId,
    'batches.productId': productId,
  })
    .select('batches date createdAt')
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const batchMetaMap = new Map<
    string,
    {
      productName: string;
      purchasePrice: number;
      expiryDate: string;
      retail: number;
      wholesale: number;
      date: Date;
    }
  >();

  for (const doc of docs) {
    for (const b of doc.batches) {
      if (b.productId.toString() === productId && b.batchNumber && b.batchNumber.trim()) {
        const bn = b.batchNumber.trim();
        batchMetaMap.set(bn, {
          productName: b.productName || '',
          purchasePrice: b.purchasePrice ?? 0,
          expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString().split('T')[0] : '',
          retail: b.retail ?? 0,
          wholesale: b.wholesale ?? 0,
          date: doc.date,
        });
      }
    }
  }

  // Also fetch product defaults in case a batch was created in Adjustment/Opening
  const prodDoc = await Product.findById(productId).select('name retailPrice wholesalePrice purchasePrice').lean();
  const defaultName = prodDoc?.name || '';
  const defaultRetail = prodDoc?.retailPrice ?? 0;
  const defaultWholesale = prodDoc?.wholesalePrice ?? 0;
  const defaultCost = prodDoc?.purchasePrice ?? 0;

  // 2. Aggregate all InventoryTransaction for this product grouped by batchNumber
  const txAgg = await InventoryTransaction.aggregate([
    { $match: { companyId: companyOid, productId: productOid } },
    {
      $group: {
        _id: '$batchNumber',
        totalIn: { $sum: '$quantityIn' },
        totalOut: { $sum: '$quantityOut' },
        lastCost: { $last: '$costPrice' },
      },
    },
  ]);

  // Find all batches that have explicit batchNumber
  const batchStocks = new Map<string, { totalIn: number; totalOut: number; lastCost: number }>();
  let unassignedOut = 0;
  let unassignedIn = 0;

  for (const item of txAgg) {
    const bn = item._id ? String(item._id).trim() : '';
    if (bn) {
      batchStocks.set(bn, {
        totalIn: item.totalIn || 0,
        totalOut: item.totalOut || 0,
        lastCost: item.lastCost || 0,
      });
    } else {
      unassignedOut += item.totalOut || 0;
      unassignedIn += item.totalIn || 0;
    }
  }

  // Also ensure any batch from PurchaseInvoice is in batchStocks even if 0 transactions
  for (const [bn] of batchMetaMap) {
    if (!batchStocks.has(bn)) {
      batchStocks.set(bn, { totalIn: 0, totalOut: 0, lastCost: 0 });
    }
  }

  if (batchStocks.size === 0) return [];

  // Build result list
  const result: {
    batchNumber: string;
    productId: string;
    productName: string;
    purchasePrice: number;
    expiryDate: string;
    quantity: number;
    retail: number;
    wholesale: number;
  }[] = [];

  for (const [bn, stock] of batchStocks) {
    const meta = batchMetaMap.get(bn);
    const netQty = stock.totalIn - stock.totalOut;

    result.push({
      batchNumber: bn,
      productId,
      productName: meta?.productName || defaultName,
      purchasePrice: meta?.purchasePrice || stock.lastCost || defaultCost,
      expiryDate: meta?.expiryDate || '',
      quantity: netQty,
      retail: meta?.retail || defaultRetail,
      wholesale: meta?.wholesale || defaultWholesale,
    });
  }

  // If there are unassigned transactions without batchNumber, deduct unassigned net out FIFO
  let netUnassignedOut = unassignedOut - unassignedIn;
  if (netUnassignedOut > 0) {
    for (const b of result) {
      if (netUnassignedOut <= 0) break;
      const deduct = Math.min(b.quantity, netUnassignedOut);
      b.quantity -= deduct;
      netUnassignedOut -= deduct;
    }
  }

  // Return batches that have available stock > 0
  return result.filter((b) => b.quantity > 0);
}

// ─── Purchase Report Service ───────────────────────────────
export interface PurchaseReportFilterOpts {
  filterType?: 'default' | 'product' | 'product_total' | 'month' | 'daily' | 'monthly';
  purchaseType?: 'Purchase' | 'PurchaseOrder' | 'PurchaseReturn' | 'OpeningStock' | 'OpeningPurchase' | string;
  productId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
}

interface NormalizedDoc {
  _id: string;
  invoiceNo: string;
  supplierInvoiceNo: string;
  date: Date;
  supplierName: string;
  paymentType: string;
  cashAccount: string;
  vatType: 'Vat' | 'NonVat';
  taxMode: 'inclusive' | 'exclusive';
  totalAmount: number;
  itemsDiscount: number;
  otherDiscount: number;
  freightCharge: number;
  otherCharges: number;
  roundOff: number;
  user: string;
  location: string;
  purchaseType: string;
  batches: Array<{
    productId?: any;
    productCode?: string;
    productName?: string;
    batchNumber?: string;
    purchasePrice?: number;
    quantity?: number;
    discAmount?: number;
    expiryDate?: Date;
    retail?: number;
    wholesale?: number;
  }>;
}

export async function getPurchaseReport(
  companyId: string,
  financialYearId?: string,
  opts: PurchaseReportFilterOpts = {}
) {
  const filterType = opts.filterType || 'default';
  const pType = opts.purchaseType || 'Purchase';
  const filter: Record<string, unknown> = {
    companyId: new mongoose.Types.ObjectId(companyId),
  };

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

  // Fetch company default location
  let defaultLocation = 'Main Location';
  try {
    const comp = await Company.findById(companyId).select('name location').lean();
    if (comp?.location) defaultLocation = comp.location;
  } catch {}

  // Load and normalize source documents based on purchaseType
  let docs: NormalizedDoc[] = [];

  if (pType === 'PurchaseOrder') {
    const rawList = await PurchaseOrder.find(filter)
      .populate('supplierId', 'name code')
      .populate('createdBy', 'fullName username')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    docs = rawList.map((po: any) => {
      const supplier = po.supplierId as any;
      const supplierName = po.supplierName || supplier?.name || 'Supplier';
      const userObj = po.createdBy as any;
      const user = userObj?.fullName || userObj?.username || 'Admin';

      return {
        _id: po._id.toString(),
        invoiceNo: po.invoiceNo || '',
        supplierInvoiceNo: po.supplierInvoiceNo || '',
        date: po.date,
        supplierName,
        paymentType: '',
        cashAccount: '',
        vatType: (po.vatType || 'Vat') as any,
        taxMode: (po.taxMode || 'inclusive') as any,
        totalAmount: Number(po.totalAmount || 0),
        itemsDiscount: Number(po.itemsDiscount || 0),
        otherDiscount: Number(po.otherDiscount || 0),
        freightCharge: Number(po.freightCharge || 0),
        otherCharges: Number(po.otherCharges || 0),
        roundOff: Number(po.roundOff || 0),
        user,
        location: defaultLocation,
        purchaseType: 'PurchaseOrder',
        batches: (po.batches || []).map((b: any) => ({
          productId: b.productId,
          productCode: b.productCode,
          productName: b.productName,
          batchNumber: b.batchNumber,
          purchasePrice: b.purchasePrice,
          quantity: b.quantity,
          discAmount: b.discAmount,
          expiryDate: b.expiryDate,
          retail: b.retail,
          wholesale: b.wholesale,
        })),
      };
    });
  } else if (pType === 'PurchaseReturn') {
    const rawList = await PurchaseReturn.find(filter)
      .populate('supplierId', 'name code')
      .populate('cashAccountId', 'name code')
      .populate('createdBy', 'fullName username')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    docs = rawList.map((pr: any) => {
      const supplier = pr.supplierId as any;
      const supplierName = pr.supplierName || supplier?.name || 'Supplier';
      const userObj = pr.createdBy as any;
      const user = userObj?.fullName || userObj?.username || 'Admin';
      const cashAccount = (pr.cashAccountId as any)?.name || '';

      return {
        _id: pr._id.toString(),
        invoiceNo: pr.invoiceNo || '',
        supplierInvoiceNo: pr.supplierInvoiceNo || '',
        date: pr.date,
        supplierName,
        paymentType: pr.returnType || 'Return',
        cashAccount,
        vatType: (pr.vatType || 'Vat') as any,
        taxMode: (pr.taxMode || 'inclusive') as any,
        totalAmount: Number(pr.totalAmount || 0),
        itemsDiscount: Number(pr.itemsDiscount || 0),
        otherDiscount: Number(pr.otherDiscount || 0),
        freightCharge: Number(pr.freightCharge || 0),
        otherCharges: Number(pr.otherCharges || 0),
        roundOff: Number(pr.roundOff || 0),
        user,
        location: defaultLocation,
        purchaseType: 'PurchaseReturn',
        batches: (pr.items || []).map((it: any) => ({
          productId: it.productId,
          productCode: it.productCode,
          productName: it.productName,
          batchNumber: it.batchNumber,
          purchasePrice: it.purchasePrice,
          quantity: it.quantity,
          discAmount: it.discAmount,
          expiryDate: undefined,
          retail: 0,
          wholesale: 0,
        })),
      };
    });
  } else if (pType === 'OpeningStock' || pType === 'OpeningPurchase') {
    const rawList = await OpeningPurchaseEntry.find(filter)
      .populate('createdBy', 'fullName username')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    docs = rawList.map((os: any) => {
      const userObj = os.createdBy as any;
      const user = userObj?.fullName || userObj?.username || 'Admin';

      return {
        _id: os._id.toString(),
        invoiceNo: os.entryNo || '',
        supplierInvoiceNo: '',
        date: os.date,
        supplierName: '',
        paymentType: '',
        cashAccount: '',
        vatType: (os.vatType || 'NonVat') as any,
        taxMode: (os.taxMode || 'inclusive') as any,
        totalAmount: Number(os.totalAmount || 0),
        itemsDiscount: 0,
        otherDiscount: 0,
        freightCharge: 0,
        otherCharges: 0,
        roundOff: 0,
        user,
        location: defaultLocation,
        purchaseType: 'OpeningPurchase',
        batches: (os.batches || []).map((b: any) => ({
          productId: b.productId,
          productCode: b.productCode,
          productName: b.productName,
          batchNumber: b.batchNumber,
          purchasePrice: b.purchasePrice,
          quantity: b.quantity,
          discAmount: b.discAmount,
          expiryDate: b.expiryDate,
          retail: b.retail,
          wholesale: b.wholesale,
        })),
      };
    });
  } else {
    // Default: Purchase Entry (PurchaseInvoice)
    const rawList = await PurchaseInvoice.find(filter)
      .populate('supplierId', 'name code')
      .populate('cashAccountId', 'name code')
      .populate('createdBy', 'fullName username')
      .sort({ date: -1, createdAt: -1 })
      .lean();

    docs = rawList.map((inv: any) => {
      const supplier = inv.supplierId as any;
      const supplierName = inv.supplierName || supplier?.name || 'Cash Supplier';
      const userObj = inv.createdBy as any;
      const user = userObj?.fullName || userObj?.username || 'Admin';
      const cashAccount = (inv.cashAccountId as any)?.name || '';

      return {
        _id: inv._id.toString(),
        invoiceNo: inv.invoiceNo || '',
        supplierInvoiceNo: inv.supplierInvoiceNo || '',
        date: inv.date,
        supplierName,
        paymentType: inv.paymentType || 'Credit',
        cashAccount,
        vatType: (inv.vatType || 'Vat') as any,
        taxMode: (inv.taxMode || 'inclusive') as any,
        totalAmount: Number(inv.totalAmount || 0),
        itemsDiscount: Number(inv.itemsDiscount || 0),
        otherDiscount: Number(inv.otherDiscount || 0),
        freightCharge: Number(inv.freightCharge || 0),
        otherCharges: Number(inv.otherCharges || 0),
        roundOff: Number(inv.roundOff || 0),
        user,
        location: defaultLocation,
        purchaseType: 'Purchase',
        batches: (inv.batches || []).map((b: any) => ({
          productId: b.productId,
          productCode: b.productCode,
          productName: b.productName,
          batchNumber: b.batchNumber,
          purchasePrice: b.purchasePrice,
          quantity: b.quantity,
          discAmount: b.discAmount,
          expiryDate: b.expiryDate,
          retail: b.retail,
          wholesale: b.wholesale,
        })),
      };
    });
  }

  // 1. DEFAULT VIEW: PURCHASE INVOICE WISE
  if (filterType === 'default') {
    let rows = docs.map((inv) => {
      const invIdStr = inv._id;
      const supplierName = inv.supplierName;
      const user = inv.user;
      const cashAccount = inv.cashAccount;

      const isVat = (inv.vatType || 'Vat') === 'Vat';
      const taxMode = inv.taxMode ?? 'inclusive';
      const grandTotal = Number(inv.totalAmount || 0);
      const itemsDiscount = Number(inv.itemsDiscount || 0);
      const otherDiscount = Number(inv.otherDiscount || 0);
      const totalDiscount = itemsDiscount + otherDiscount;
      const freightCharge = Number(inv.freightCharge || 0);
      const otherCharge = Number(inv.otherCharges || 0);
      const roundoff = Number(inv.roundOff || 0);

      // Compute sum of batches
      let batchGrossSum = 0;
      let totalQty = 0;
      for (const b of (inv.batches || [])) {
        const q = Number(b.quantity || 0);
        const p = Number(b.purchasePrice || 0);
        totalQty += q;
        batchGrossSum += q * p;
      }

      // Calculate VAT
      let itemsVat = 0;
      if (isVat) {
        if (taxMode === 'inclusive') {
          itemsVat = parseFloat(((grandTotal * 5) / 105).toFixed(2));
        } else {
          itemsVat = parseFloat(((grandTotal * 5) / 100).toFixed(2));
        }
      }
      const netAdjustments = otherCharge + freightCharge + roundoff - otherDiscount;
      const vatFromAdjustments = isVat && netAdjustments !== 0
        ? parseFloat(((netAdjustments * 5) / 105).toFixed(2))
        : 0;
      const vatAmount = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));

      const grossAmount = (taxMode === 'inclusive' && isVat)
        ? grandTotal - vatAmount + totalDiscount - otherCharge - freightCharge - roundoff
        : grandTotal + totalDiscount - otherCharge - freightCharge - roundoff;

      return {
        _id: invIdStr,
        invoiceId: invIdStr,
        entryNumber: inv.invoiceNo,
        supplierInvoiceNo: inv.supplierInvoiceNo || '',
        date: inv.date,
        supplierName,
        paymentType: inv.paymentType,
        grossAmount: Number((batchGrossSum > 0 ? batchGrossSum : grossAmount).toFixed(2)),
        itemsDiscount: Number(itemsDiscount.toFixed(2)),
        otherDiscount: Number(otherDiscount.toFixed(2)),
        totalDiscount: Number(totalDiscount.toFixed(2)),
        freightCharge: Number(freightCharge.toFixed(2)),
        otherCharge: Number(otherCharge.toFixed(2)),
        vatAmount: Number(vatAmount.toFixed(2)),
        roundoff: Number(roundoff.toFixed(2)),
        grandTotal: Number(grandTotal.toFixed(2)),
        itemCount: inv.batches?.length || 0,
        totalQuantity: Number(totalQty.toFixed(2)),
        user,
        location: inv.location,
        cashAccount,
        vatType: inv.vatType || 'Vat',
        taxMode,
        purchaseType: inv.purchaseType,
      };
    });

    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.entryNumber.toLowerCase().includes(q) ||
          r.supplierInvoiceNo.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q) ||
          r.user.toLowerCase().includes(q) ||
          (r.location && r.location.toLowerCase().includes(q)) ||
          (r.cashAccount && r.cashAccount.toLowerCase().includes(q))
      );
    }

    return { filterType: 'default', purchaseType: pType, rows };
  }

  // 2. PRODUCT WISE: DETAILED TRANSACTIONS
  if (filterType === 'product') {
    const isSpecific = Boolean(
      opts.productId && opts.productId !== 'ALL' && mongoose.Types.ObjectId.isValid(opts.productId)
    );

    // Collect all unique product IDs from normalized docs
    const productIdSet = new Set<string>();
    for (const inv of docs) {
      for (const b of (inv.batches || [])) {
        if (b.productId) productIdSet.add(b.productId.toString());
      }
    }

    const products = await Product.find({ _id: { $in: Array.from(productIdSet) } })
      .populate('unitOfMeasureId', 'name shortCode')
      .populate('categoryId', 'name code')
      .lean();
    const prodMap = new Map(products.map((p) => [p._id.toString(), p]));

    let rows: any[] = [];
    for (const inv of docs) {
      const supplierName = inv.supplierName;
      const isVat = (inv.vatType || 'Vat') === 'Vat';
      const taxMode = inv.taxMode ?? 'inclusive';

      (inv.batches || []).forEach((b: any, idx: number) => {
        const prodIdStr = b.productId?.toString() || '';
        if (isSpecific && prodIdStr !== opts.productId) return;

        const prod = prodMap.get(prodIdStr) as any;
        const uom = prod?.unitOfMeasureId;
        const unit = prod?.packageUnit || uom?.shortCode || uom?.name || 'Pcs';
        const category = prod?.categoryId as any;
        const categoryName = category?.name || '';
        const brand = prod?.brand || '';

        const qty = Number(b.quantity || 0);
        const rate = Number(b.purchasePrice || 0);
        const disc = Number(b.discAmount || 0);
        const gross = qty * rate;
        const net = Math.max(gross - disc, 0);

        let lineVat = 0;
        if (isVat) {
          lineVat = taxMode === 'exclusive' ? (net * 0.05) : ((net * 5) / 105);
        }
        const lineTotal = taxMode === 'exclusive' && isVat ? net + lineVat : net;

        rows.push({
          _id: `${inv._id}_${idx}`,
          invoiceId: inv._id,
          productId: prodIdStr,
          date: inv.date,
          invNumber: inv.invoiceNo,
          supplierInvoiceNo: inv.supplierInvoiceNo || '',
          supplierName,
          paymentType: inv.paymentType,
          productCode: b.productCode || prod?.code || prod?.sku || '',
          productName: b.productName || prod?.name || '',
          productBarcode: prod?.systemBarcode || prod?.internationalBarcode || prod?.sku || '',
          productOfficialName: prod?.genericName || prod?.officialCode || '',
          batchNumber: b.batchNumber || '',
          expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString().split('T')[0] : '',
          category: categoryName,
          brand,
          unit,
          qty: Number(qty.toFixed(2)),
          purchasePrice: Number(rate.toFixed(2)),
          discount: Number(disc.toFixed(2)),
          grossAmount: Number(gross.toFixed(2)),
          netAmount: Number(net.toFixed(2)),
          vat: Number(lineVat.toFixed(2)),
          totalAmount: Number(lineTotal.toFixed(2)),
          retail: Number((b.retail || prod?.retailPrice || 0).toFixed(2)),
          wholesale: Number((b.wholesale || prod?.wholesalePrice || 0).toFixed(2)),
          location: inv.location,
          purchaseType: inv.purchaseType,
        });
      });
    }

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
          r.supplierInvoiceNo.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.productCode.toLowerCase().includes(q) ||
          r.productBarcode.toLowerCase().includes(q) ||
          r.productOfficialName.toLowerCase().includes(q) ||
          r.batchNumber.toLowerCase().includes(q) ||
          (r.category && r.category.toLowerCase().includes(q)) ||
          (r.brand && r.brand.toLowerCase().includes(q))
      );
    }

    return { filterType: 'product', purchaseType: pType, isSpecificProduct: isSpecific, rows };
  }

  // 3. PRODUCT WISE TOTAL: AGGREGATED PRODUCT TOTALS FOR PERIOD
  if (filterType === 'product_total') {
    const isSpecific = Boolean(
      opts.productId && opts.productId !== 'ALL' && mongoose.Types.ObjectId.isValid(opts.productId)
    );

    const productIdSet = new Set<string>();
    for (const inv of docs) {
      for (const b of (inv.batches || [])) {
        if (b.productId) productIdSet.add(b.productId.toString());
      }
    }

    const products = await Product.find({ _id: { $in: Array.from(productIdSet) } })
      .populate('unitOfMeasureId', 'name shortCode')
      .populate('categoryId', 'name code')
      .lean();
    const prodMetaMap = new Map(products.map((p) => [p._id.toString(), p]));

    const prodSummaryMap: Record<string, any> = {};

    for (const inv of docs) {
      const supplierName = inv.supplierName;
      const isVat = (inv.vatType || 'Vat') === 'Vat';
      const taxMode = inv.taxMode ?? 'inclusive';

      for (const b of (inv.batches || [])) {
        const prodIdStr = b.productId?.toString() || '';
        if (!prodIdStr) continue;
        if (isSpecific && prodIdStr !== opts.productId) continue;

        const prod = prodMetaMap.get(prodIdStr) as any;
        const uom = prod?.unitOfMeasureId;
        const unit = prod?.packageUnit || uom?.shortCode || uom?.name || 'Pcs';
        const category = prod?.categoryId as any;
        const categoryName = category?.name || '';
        const brand = prod?.brand || '';

        if (!prodSummaryMap[prodIdStr]) {
          prodSummaryMap[prodIdStr] = {
            productId: prodIdStr,
            productCode: b.productCode || prod?.code || prod?.sku || '',
            productName: b.productName || prod?.name || '',
            productBarcode: prod?.systemBarcode || prod?.internationalBarcode || prod?.sku || '',
            productOfficialName: prod?.genericName || prod?.officialCode || '',
            category: categoryName,
            brand,
            supplierNames: new Set<string>(),
            unit,
            qty: 0,
            grossAmount: 0,
            discount: 0,
            vat: 0,
            totalAmount: 0,
            invoiceIds: new Set<string>(),
          };
        }

        if (supplierName) prodSummaryMap[prodIdStr].supplierNames.add(supplierName);
        prodSummaryMap[prodIdStr].invoiceIds.add(inv._id);

        const qty = Number(b.quantity || 0);
        const rate = Number(b.purchasePrice || 0);
        const disc = Number(b.discAmount || 0);
        const gross = qty * rate;
        const net = Math.max(gross - disc, 0);

        let lineVat = 0;
        if (isVat) {
          lineVat = taxMode === 'exclusive' ? (net * 0.05) : ((net * 5) / 105);
        }
        const lineTotal = taxMode === 'exclusive' && isVat ? net + lineVat : net;

        prodSummaryMap[prodIdStr].qty += qty;
        prodSummaryMap[prodIdStr].grossAmount += gross;
        prodSummaryMap[prodIdStr].discount += disc;
        prodSummaryMap[prodIdStr].vat += lineVat;
        prodSummaryMap[prodIdStr].totalAmount += lineTotal;
      }
    }

    let rows = Object.values(prodSummaryMap).map((r: any) => {
      const sNames = Array.from(r.supplierNames as Set<string>);
      const qty = Number(r.qty.toFixed(2));
      const totalAmount = Number(r.totalAmount.toFixed(2));
      const avgPrice = qty > 0 ? Number((totalAmount / qty).toFixed(2)) : 0;

      return {
        productId: r.productId,
        productCode: r.productCode,
        productName: r.productName,
        productBarcode: r.productBarcode,
        productOfficialName: r.productOfficialName,
        category: r.category,
        brand: r.brand,
        supplierNames: sNames,
        supplierName: sNames.join(', '),
        unit: r.unit,
        qty,
        avgPurchasePrice: avgPrice,
        grossAmount: Number(r.grossAmount.toFixed(2)),
        discount: Number(r.discount.toFixed(2)),
        vat: Number(r.vat.toFixed(2)),
        totalAmount,
        invoiceCount: (r.invoiceIds as Set<string>).size,
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
          (r.supplierName && r.supplierName.toLowerCase().includes(q))
      );
    }

    return { filterType: 'product_total', purchaseType: pType, isSpecificProduct: false, rows };
  }

  // 4. MONTH WISE ITEMS
  if (filterType === 'month') {
    const isSpecific = Boolean(
      opts.productId && opts.productId !== 'ALL' && mongoose.Types.ObjectId.isValid(opts.productId)
    );

    const productIdSet = new Set<string>();
    for (const inv of docs) {
      for (const b of (inv.batches || [])) {
        if (b.productId) productIdSet.add(b.productId.toString());
      }
    }

    const products = await Product.find({ _id: { $in: Array.from(productIdSet) } })
      .populate('categoryId', 'name code')
      .lean();
    const prodMetaMap = new Map(products.map((p) => [p._id.toString(), p]));

    const monthKeySet = new Set<string>();
    const prodMap: Record<string, any> = {};

    for (const inv of docs) {
      if (!inv.date) continue;
      const d = new Date(inv.date);
      if (isNaN(d.getTime())) continue;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthKeySet.add(monthKey);

      const supplierName = inv.supplierName;
      const isVat = (inv.vatType || 'Vat') === 'Vat';
      const taxMode = inv.taxMode ?? 'inclusive';

      for (const b of (inv.batches || [])) {
        const prodIdStr = b.productId?.toString() || '';
        if (!prodIdStr) continue;
        if (isSpecific && prodIdStr !== opts.productId) continue;

        const prod = prodMetaMap.get(prodIdStr) as any;
        const category = prod?.categoryId as any;
        const categoryName = category?.name || '';
        const brand = prod?.brand || '';

        if (!prodMap[prodIdStr]) {
          prodMap[prodIdStr] = {
            productId: prodIdStr,
            productCode: b.productCode || prod?.code || prod?.sku || '',
            productName: b.productName || prod?.name || '',
            itemName: b.productName || prod?.name || '',
            barcode: prod?.systemBarcode || prod?.internationalBarcode || prod?.sku || '',
            productBarcode: prod?.systemBarcode || prod?.internationalBarcode || prod?.sku || '',
            officialName: prod?.genericName || prod?.officialCode || '',
            productOfficialName: prod?.genericName || prod?.officialCode || '',
            category: categoryName,
            brand,
            supplierNames: new Set<string>(),
            monthlyData: {},
            totalQty: 0,
            totalAmount: 0,
          };
        }

        if (supplierName) prodMap[prodIdStr].supplierNames.add(supplierName);
        if (!prodMap[prodIdStr].monthlyData[monthKey]) {
          prodMap[prodIdStr].monthlyData[monthKey] = { qty: 0, amount: 0 };
        }

        const qty = Number(b.quantity || 0);
        const rate = Number(b.purchasePrice || 0);
        const disc = Number(b.discAmount || 0);
        const net = Math.max(qty * rate - disc, 0);

        let lineVat = 0;
        if (isVat) {
          lineVat = taxMode === 'exclusive' ? (net * 0.05) : ((net * 5) / 105);
        }
        const lineTotal = taxMode === 'exclusive' && isVat ? net + lineVat : net;

        prodMap[prodIdStr].monthlyData[monthKey].qty += qty;
        prodMap[prodIdStr].monthlyData[monthKey].amount += lineTotal;
        prodMap[prodIdStr].totalQty += qty;
        prodMap[prodIdStr].totalAmount += lineTotal;
      }
    }

    const sortedMonthKeys = Array.from(monthKeySet).sort();
    const months = sortedMonthKeys.map((key) => {
      const [year, month] = key.split('-').map(Number);
      const dateObj = new Date(year, month - 1, 1);
      const label = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      return { key, label };
    });

    let rows = Object.values(prodMap).map((p: any) => {
      const sNames = Array.from(p.supplierNames as Set<string>);
      const roundedMonthly: Record<string, { qty: number; amount: number }> = {};
      for (const m of sortedMonthKeys) {
        const val = p.monthlyData[m] || { qty: 0, amount: 0 };
        roundedMonthly[m] = {
          qty: Number(val.qty.toFixed(2)),
          amount: Number(val.amount.toFixed(2)),
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
        supplierNames: sNames,
        supplierName: sNames.join(', '),
        monthlyData: roundedMonthly,
        totalQty: Number(p.totalQty.toFixed(2)),
        totalAmount: Number(p.totalAmount.toFixed(2)),
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
          (r.supplierName && r.supplierName.toLowerCase().includes(q))
      );
    }

    return { filterType: 'month', purchaseType: pType, months, rows };
  }

  // 5. DAILY WISE: AGGREGATED DAILY TOTALS
  if (filterType === 'daily') {
    const dayMap: Record<string, any> = {};

    for (const inv of docs) {
      let dayKey = 'Unknown';
      if (inv.date) {
        const d = new Date(inv.date);
        if (!isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          dayKey = `${y}-${m}-${day}`;
        }
      }

      if (!dayMap[dayKey]) {
        dayMap[dayKey] = {
          _id: dayKey,
          date: dayKey,
          grossAmount: 0,
          itemsDiscount: 0,
          otherDiscount: 0,
          totalDiscount: 0,
          freightCharge: 0,
          otherCharge: 0,
          vatAmount: 0,
          roundoff: 0,
          grandTotal: 0,
          totalQuantity: 0,
          invoiceCount: 0,
          cashPaid: 0,
          creditAmount: 0,
        };
      }

      const isVat = (inv.vatType || 'Vat') === 'Vat';
      const taxMode = inv.taxMode ?? 'inclusive';
      const grandTotal = Number(inv.totalAmount || 0);
      const itemsDiscount = Number(inv.itemsDiscount || 0);
      const otherDiscount = Number(inv.otherDiscount || 0);
      const totalDiscount = itemsDiscount + otherDiscount;
      const freightCharge = Number(inv.freightCharge || 0);
      const otherCharge = Number(inv.otherCharges || 0);
      const roundoff = Number(inv.roundOff || 0);

      let batchGrossSum = 0;
      let totalQty = 0;
      for (const b of (inv.batches || [])) {
        const q = Number(b.quantity || 0);
        const p = Number(b.purchasePrice || 0);
        totalQty += q;
        batchGrossSum += q * p;
      }

      let itemsVat = 0;
      if (isVat) {
        if (taxMode === 'inclusive') {
          itemsVat = parseFloat(((grandTotal * 5) / 105).toFixed(2));
        } else {
          itemsVat = parseFloat(((grandTotal * 5) / 100).toFixed(2));
        }
      }
      const netAdjustments = otherCharge + freightCharge + roundoff - otherDiscount;
      const vatFromAdjustments = isVat && netAdjustments !== 0
        ? parseFloat(((netAdjustments * 5) / 105).toFixed(2))
        : 0;
      const vatAmount = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));

      const grossAmount = batchGrossSum > 0 ? batchGrossSum : (grandTotal + totalDiscount - otherCharge - freightCharge - roundoff);

      const dRecord = dayMap[dayKey];
      dRecord.grossAmount += grossAmount;
      dRecord.itemsDiscount += itemsDiscount;
      dRecord.otherDiscount += otherDiscount;
      dRecord.totalDiscount += totalDiscount;
      dRecord.freightCharge += freightCharge;
      dRecord.otherCharge += otherCharge;
      dRecord.vatAmount += vatAmount;
      dRecord.roundoff += roundoff;
      dRecord.grandTotal += grandTotal;
      dRecord.totalQuantity += totalQty;
      dRecord.invoiceCount += 1;
      if (inv.paymentType === 'Cash') {
        dRecord.cashPaid += grandTotal;
      } else {
        dRecord.creditAmount += grandTotal;
      }
    }

    let rows = Object.values(dayMap).map((r: any) => ({
      _id: r._id,
      date: r.date,
      grossAmount: Number(r.grossAmount.toFixed(2)),
      itemsDiscount: Number(r.itemsDiscount.toFixed(2)),
      otherDiscount: Number(r.otherDiscount.toFixed(2)),
      totalDiscount: Number(r.totalDiscount.toFixed(2)),
      freightCharge: Number(r.freightCharge.toFixed(2)),
      otherCharge: Number(r.otherCharge.toFixed(2)),
      vatAmount: Number(r.vatAmount.toFixed(2)),
      roundoff: Number(r.roundoff.toFixed(2)),
      grandTotal: Number(r.grandTotal.toFixed(2)),
      totalQuantity: Number(r.totalQuantity.toFixed(2)),
      invoiceCount: r.invoiceCount,
      cashPaid: Number(r.cashPaid.toFixed(2)),
      creditAmount: Number(r.creditAmount.toFixed(2)),
    }));

    rows.sort((a, b) => b.date.localeCompare(a.date));

    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim().toLowerCase();
      rows = rows.filter((r) => r.date.toLowerCase().includes(q));
    }

    return { filterType: 'daily', purchaseType: pType, rows };
  }

  // 6. MONTHLY WISE: AGGREGATED MONTHLY TOTALS
  if (filterType === 'monthly') {
    const monthMap: Record<string, any> = {};

    for (const inv of docs) {
      let monthKey = 'Unknown';
      let monthLabel = 'Unknown';
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

      if (!monthMap[monthKey]) {
        monthMap[monthKey] = {
          _id: monthKey,
          monthKey,
          month: monthLabel,
          grossAmount: 0,
          itemsDiscount: 0,
          otherDiscount: 0,
          totalDiscount: 0,
          freightCharge: 0,
          otherCharge: 0,
          vatAmount: 0,
          roundoff: 0,
          grandTotal: 0,
          totalQuantity: 0,
          invoiceCount: 0,
          cashPaid: 0,
          creditAmount: 0,
        };
      }

      const isVat = (inv.vatType || 'Vat') === 'Vat';
      const taxMode = inv.taxMode ?? 'inclusive';
      const grandTotal = Number(inv.totalAmount || 0);
      const itemsDiscount = Number(inv.itemsDiscount || 0);
      const otherDiscount = Number(inv.otherDiscount || 0);
      const totalDiscount = itemsDiscount + otherDiscount;
      const freightCharge = Number(inv.freightCharge || 0);
      const otherCharge = Number(inv.otherCharges || 0);
      const roundoff = Number(inv.roundOff || 0);

      let batchGrossSum = 0;
      let totalQty = 0;
      for (const b of (inv.batches || [])) {
        const q = Number(b.quantity || 0);
        const p = Number(b.purchasePrice || 0);
        totalQty += q;
        batchGrossSum += q * p;
      }

      let itemsVat = 0;
      if (isVat) {
        if (taxMode === 'inclusive') {
          itemsVat = parseFloat(((grandTotal * 5) / 105).toFixed(2));
        } else {
          itemsVat = parseFloat(((grandTotal * 5) / 100).toFixed(2));
        }
      }
      const netAdjustments = otherCharge + freightCharge + roundoff - otherDiscount;
      const vatFromAdjustments = isVat && netAdjustments !== 0
        ? parseFloat(((netAdjustments * 5) / 105).toFixed(2))
        : 0;
      const vatAmount = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));

      const grossAmount = batchGrossSum > 0 ? batchGrossSum : (grandTotal + totalDiscount - otherCharge - freightCharge - roundoff);

      const mRecord = monthMap[monthKey];
      mRecord.grossAmount += grossAmount;
      mRecord.itemsDiscount += itemsDiscount;
      mRecord.otherDiscount += otherDiscount;
      mRecord.totalDiscount += totalDiscount;
      mRecord.freightCharge += freightCharge;
      mRecord.otherCharge += otherCharge;
      mRecord.vatAmount += vatAmount;
      mRecord.roundoff += roundoff;
      mRecord.grandTotal += grandTotal;
      mRecord.totalQuantity += totalQty;
      mRecord.invoiceCount += 1;
      if (inv.paymentType === 'Cash') {
        mRecord.cashPaid += grandTotal;
      } else {
        mRecord.creditAmount += grandTotal;
      }
    }

    let rows = Object.values(monthMap).map((r: any) => ({
      _id: r._id,
      monthKey: r.monthKey,
      month: r.month,
      grossAmount: Number(r.grossAmount.toFixed(2)),
      itemsDiscount: Number(r.itemsDiscount.toFixed(2)),
      otherDiscount: Number(r.otherDiscount.toFixed(2)),
      totalDiscount: Number(r.totalDiscount.toFixed(2)),
      freightCharge: Number(r.freightCharge.toFixed(2)),
      otherCharge: Number(r.otherCharge.toFixed(2)),
      vatAmount: Number(r.vatAmount.toFixed(2)),
      roundoff: Number(r.roundoff.toFixed(2)),
      grandTotal: Number(r.grandTotal.toFixed(2)),
      totalQuantity: Number(r.totalQuantity.toFixed(2)),
      invoiceCount: r.invoiceCount,
      cashPaid: Number(r.cashPaid.toFixed(2)),
      creditAmount: Number(r.creditAmount.toFixed(2)),
    }));

    rows.sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    if (opts.search && opts.search.trim()) {
      const q = opts.search.trim().toLowerCase();
      rows = rows.filter((r) => r.month.toLowerCase().includes(q) || r.monthKey.toLowerCase().includes(q));
    }

    return { filterType: 'monthly', purchaseType: pType, rows };
  }

  return { filterType, purchaseType: pType, rows: [] };
}

