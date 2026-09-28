import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { PurchaseInvoice } from '../models/PurchaseInvoice';
import { BatchSequence } from '../models/BatchSequence';
import { LedgerAccount } from '../models/LedgerAccount';
import { LedgerGroup } from '../models/LedgerGroup';
import { AppError } from '../middlewares/errorHandler';
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
    const batchNumber = (b.batchNumber?.trim())
      ? b.batchNumber.trim()
      : await getNextBatchNumber(input.companyId);
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

  await PurchaseInvoice.create({
    _id: purchaseId,
    companyId: input.companyId,
    financialYearId: input.financialYearId,
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
    createdBy: input.createdBy ? new mongoose.Types.ObjectId(input.createdBy) : undefined,
  });

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
    await createPurchaseVoucher(input.companyId, input.financialYearId, purchaseId.toString(), input.invoiceNo, purchaseDate, input, totalAmount, itemsDiscount, otherDiscount, otherCharges, freightCharge, roundOff);
  } catch (err) {
    await PurchaseInvoice.deleteOne({ _id: purchaseId });
    await InventoryTransaction.deleteMany({ referenceType: 'Purchase', referenceId: purchaseId });
    console.error(`[Purchase ${input.invoiceNo}] Voucher creation failed — purchase rolled back:`, err);
    throw err;
  }

  // 4. Create bill reference ("New Ref" — payable to supplier)
  if (input.supplierId && totalAmount > 0) {
    try {
      await billReferenceService.createNewRef({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        ledgerAccountId: input.supplierId,
        billNumber: input.invoiceNo,
        referenceType: 'PurchaseInvoice',
        referenceId: purchaseId.toString(),
        date: purchaseDate,
        amount: totalAmount - itemsDiscount + otherCharges + freightCharge + roundOff - otherDiscount,
        drCr: 'Cr',
        narration: `Purchase ${input.invoiceNo}`,
      });
    } catch (err) {
      console.error(`[Purchase ${input.invoiceNo}] Bill reference creation failed:`, err);
    }
  }

  return {
    purchaseId: purchaseId.toString(),
    invoiceNo: input.invoiceNo,
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
    const batchNumber = (b.batchNumber?.trim())
      ? b.batchNumber.trim()
      : await getNextBatchNumber(input.companyId);
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
  const doc = await PurchaseInvoice.findById(id)
    .populate('supplierId', 'name code')
    .populate('cashAccountId', 'name code')
    .populate('voucherId', 'voucherNo')
    .lean();
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
  const last = await PurchaseInvoice.findOne({ companyId })
    .sort({ createdAt: -1 })
    .select('invoiceNo')
    .lean();

  if (!last) return 'PUR-0001';

  const match = last.invoiceNo.match(/PUR-(\d+)/);
  if (match) {
    const next = parseInt(match[1], 10) + 1;
    return `PUR-${String(next).padStart(4, '0')}`;
  }
  return `PUR-${Date.now().toString(36).toUpperCase()}`;
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

// ─── Get batches for a specific product across all purchases ─
// Returns only batches with actual available stock > 0,
// using FIFO to distribute sold quantities across batches.
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

  // 1. Get raw purchase batches sorted oldest first
  const docs = await PurchaseInvoice.find({
    companyId,
    'batches.productId': productId,
  })
    .select('batches date createdAt')
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const rawBatches: {
    batchNumber: string;
    productId: string;
    productName: string;
    purchasePrice: number;
    expiryDate: string;
    purchasedQty: number;
    retail: number;
    wholesale: number;
    date: Date;
  }[] = [];

  for (const doc of docs) {
    for (const b of doc.batches) {
      if (b.productId.toString() === productId) {
        rawBatches.push({
          batchNumber: b.batchNumber || '',
          productId: b.productId.toString(),
          productName: b.productName || '',
          purchasePrice: b.purchasePrice ?? 0,
          expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString().split('T')[0] : '',
          purchasedQty: b.quantity ?? 0,
          retail: b.retail ?? 0,
          wholesale: b.wholesale ?? 0,
          date: doc.date,
        });
      }
    }
  }

  if (rawBatches.length === 0) return [];

  // 2. Get net stock from InventoryTransaction (totalIn - totalOut)
  const stockAgg = await InventoryTransaction.aggregate([
    { $match: { companyId: companyOid, productId: productOid } },
    {
      $group: {
        _id: null,
        totalIn: { $sum: '$quantityIn' },
        totalOut: { $sum: '$quantityOut' },
      },
    },
  ]);
  const netStock = stockAgg.length > 0 ? stockAgg[0].totalIn - stockAgg[0].totalOut : 0;
  const totalPurchased = rawBatches.reduce((sum, b) => sum + b.purchasedQty, 0);
  const totalSold = totalPurchased - netStock;

  // 3. Distribute sold qty across batches using FIFO (oldest first)
  let soldRemaining = Math.max(totalSold, 0);
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

  for (const b of rawBatches) {
    const soldFromBatch = Math.min(b.purchasedQty, soldRemaining);
    const availableQty = b.purchasedQty - soldFromBatch;
    soldRemaining -= soldFromBatch;

    // Only include batches that still have stock
    if (availableQty > 0) {
      result.push({
        batchNumber: b.batchNumber,
        productId: b.productId,
        productName: b.productName,
        purchasePrice: b.purchasePrice,
        expiryDate: b.expiryDate,
        quantity: availableQty,
        retail: b.retail,
        wholesale: b.wholesale,
      });
    }
  }

  // 4. Handle excess stock from sales returns:
  //    When returns push netStock above totalPurchased, find which batch each
  //    return belongs to and add the excess to that specific batch.
  if (totalSold < 0) {
    const excessStock = Math.abs(totalSold);

    // Query SalesReturn transactions for this product to find per-batch return quantities
    const returnAgg = await InventoryTransaction.aggregate([
      {
        $match: {
          companyId: companyOid,
          productId: productOid,
          type: 'SalesReturn',
          quantityIn: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: '$batchNumber',
          totalReturned: { $sum: '$quantityIn' },
        },
      },
    ]);

    let excessRemaining = excessStock;
    for (const ret of returnAgg) {
      if (excessRemaining <= 0) break;
      const retBatch = ret._id || ''; // batchNumber from the return
      const retQty = Math.min(ret.totalReturned, excessRemaining);

      // Find the matching batch in the result
      const matchIdx = result.findIndex((r) => r.batchNumber === retBatch);
      if (matchIdx >= 0) {
        result[matchIdx].quantity += retQty;
        excessRemaining -= retQty;
      } else {
        // Batch was fully sold out but returns brought stock back — find it in rawBatches
        const rawMatch = rawBatches.find((b) => b.batchNumber === retBatch);
        if (rawMatch) {
          result.push({
            batchNumber: rawMatch.batchNumber,
            productId: rawMatch.productId,
            productName: rawMatch.productName,
            purchasePrice: rawMatch.purchasePrice,
            expiryDate: rawMatch.expiryDate,
            quantity: retQty,
            retail: rawMatch.retail,
            wholesale: rawMatch.wholesale,
          });
          excessRemaining -= retQty;
        }
      }
    }

    // If any excess still remains (e.g. old returns without batchNumber), add to newest batch
    if (excessRemaining > 0) {
      if (result.length > 0) {
        result[result.length - 1].quantity += excessRemaining;
      } else if (rawBatches.length > 0) {
        const newest = rawBatches[rawBatches.length - 1];
        result.push({
          batchNumber: newest.batchNumber,
          productId: newest.productId,
          productName: newest.productName,
          purchasePrice: newest.purchasePrice,
          expiryDate: newest.expiryDate,
          quantity: excessRemaining,
          retail: newest.retail,
          wholesale: newest.wholesale,
        });
      }
    }
  }

  return result;
}
