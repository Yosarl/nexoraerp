import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { Company } from '../models/Company';
import { LedgerAccount } from '../models/LedgerAccount';
import { UnitOfMeasure } from '../models/UnitOfMeasure';
import { AuditLog } from '../models/AuditLog';
import { AppError } from '../middlewares/errorHandler';
import * as voucherService from './voucherService';
import * as ledgerService from './ledgerService';
import * as productService from './productService';
import { OpeningStockEntry } from '../models/OpeningStockEntry';

export interface OpeningStockItem {
  productId: string;
  quantity: number;
  costPrice: number;
}

export async function postOpeningStock(
  companyId: string,
  financialYearId: string,
  items: OpeningStockItem[],
  userId?: string
): Promise<{ inventoryCount: number; voucherId?: string }> {
  const company = await Company.findById(companyId);
  if (!company) throw new AppError('Company not found', 404);

  const stockAccount = await LedgerAccount.findOne({
    companyId,
    code: /STOCK|INVENTORY/i,
    type: 'Other',
  });
  const equityGroup = await LedgerAccount.findOne({ companyId, code: /EQUITY|CAPITAL/i });
  const stockLedgerId = stockAccount?._id.toString();
  const equityLedgerId = equityGroup?._id.toString();

  let totalStockValue = 0;
  const invTxns: Array<{
    companyId: string;
    financialYearId: string;
    productId: mongoose.Types.ObjectId;
    date: Date;
    type: 'Opening';
    quantityIn: number;
    quantityOut: number;
    costPrice: number;
    createdBy?: string;
  }> = [];

  const date = new Date();

  for (const item of items) {
    const product = await Product.findOne({ _id: item.productId, companyId });
    if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);
    const value = item.quantity * item.costPrice;
    totalStockValue += value;
    invTxns.push({
      companyId,
      financialYearId,
      productId: product._id,
      date,
      type: 'Opening',
      quantityIn: item.quantity,
      quantityOut: 0,
      costPrice: item.costPrice,
      createdBy: userId,
    });
  }

  await InventoryTransaction.insertMany(invTxns);

  let voucherId: string | undefined;
  if (stockLedgerId && equityLedgerId && totalStockValue > 0) {
    const voucher = await voucherService.createAndPost({
      companyId,
      financialYearId,
      voucherType: 'Opening',
      date,
      narration: 'Opening stock',
      lines: [
        { ledgerAccountId: stockLedgerId, debitAmount: totalStockValue, creditAmount: 0 },
        { ledgerAccountId: equityLedgerId, debitAmount: 0, creditAmount: totalStockValue },
      ],
      createdBy: userId,
    });
    voucherId = voucher._id.toString();
  } else if (totalStockValue > 0) {
    const cashAccount = await LedgerAccount.findOne({ companyId, type: 'Cash' });
    const equityAccount = await LedgerAccount.findOne({ companyId, type: 'Other' }).populate('groupId');
    const g = equityAccount?.groupId as { type?: string } | null;
    const equity = g?.type?.toUpperCase() === 'EQUITY' ? equityAccount : await LedgerAccount.findOne({ companyId, code: 'EQUITY001' });
    if (cashAccount && equity) {
      const v = await voucherService.createAndPost({
        companyId,
        financialYearId,
        voucherType: 'Journal',
        date,
        narration: 'Opening stock (no stock ledger – post to equity)',
        lines: [
          { ledgerAccountId: cashAccount._id.toString(), debitAmount: totalStockValue, creditAmount: 0 },
          { ledgerAccountId: equity._id.toString(), debitAmount: 0, creditAmount: totalStockValue },
        ],
        createdBy: userId,
      });
      voucherId = v._id.toString();
    }
  }

  return { inventoryCount: invTxns.length, voucherId };
}

export interface ImportRowMapping {
  productCode?: number;
  productName?: number;
  barcode?: number;
  category?: number;
  quantity: number;
  cost: number;
  vendor?: number;
}

export async function importProductsAndOpeningStock(
  companyId: string,
  financialYearId: string,
  mapping: ImportRowMapping,
  rows: string[][],
  userId?: string
): Promise<{ created: number; updated: number; errors: string[] }> {
  const company = await Company.findById(companyId);
  if (!company) throw new AppError('Company not found', 404);

  // Units are now global
  const defaultUnit = await UnitOfMeasure.findOne({}).sort({ shortCode: 1 });
  if (!defaultUnit) throw new AppError('No unit of measure found. Create units first.', 400);

  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  const items: OpeningStockItem[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const get = (col?: number) => (col !== undefined && col >= 0 && row[col] !== undefined ? String(row[col]).trim() : '');
    const productCode = get(mapping.productCode);
    const productName = get(mapping.productName) || productCode;
    const barcode = get(mapping.barcode);
    const qty = Number(get(mapping.quantity));
    const cost = Number(get(mapping.cost));

    if (!productCode && !barcode) {
      errors.push(`Row ${i + 2}: Product code or barcode required`);
      continue;
    }
    if (isNaN(qty) || qty < 0) {
      errors.push(`Row ${i + 2}: Invalid quantity`);
      continue;
    }
    if (isNaN(cost) || cost < 0) {
      errors.push(`Row ${i + 2}: Invalid cost`);
      continue;
    }

    let product = await Product.findOne({
      companyId,
      $or: [
        { sku: productCode },
        { systemBarcode: productCode },
        ...(barcode ? [{ internationalBarcode: barcode }, { systemBarcode: barcode }] : []),
      ],
    });

    if (!product) {
      const newProduct = await productService.createProduct({
        companyId,
        name: productName || productCode || 'Imported',
        sku: productCode || `IMP-${Date.now()}-${i}`,
        internationalBarcode: barcode || undefined,
        purchasePrice: cost,
        sellingPrice: cost,
        unitOfMeasureId: defaultUnit._id.toString(),
        vatCategory: 'standard',
        createdBy: userId,
      });
      product = await Product.findById(newProduct._id);
      created++;
    } else {
      updated++;
    }

    if (product) {
      items.push({
        productId: product._id.toString(),
        quantity: qty,
        costPrice: cost,
      });
    }
  }

  if (items.length > 0) {
    await postOpeningStock(companyId, financialYearId, items, userId);
  }

  if (userId) {
    await AuditLog.create({
      userId: new mongoose.Types.ObjectId(userId),
      companyId: new mongoose.Types.ObjectId(companyId),
      action: 'Import',
      entityType: 'OpeningStock',
      details: `Import opening stock: ${created} products created, ${updated} existing, ${items.length} stock lines`,
    });
  }

  return { created, updated, errors };
}

// ─── Document-based Opening Stock Entry (list / get / create / update) ───

const OPENING_STOCK_ENTRY_PREFIX = 'OS';

export async function getNextOpeningStockEntryNo(
  companyId: string,
  financialYearId: string
): Promise<string> {
  const last = await OpeningStockEntry.findOne({ companyId, financialYearId })
    .sort({ entryNo: -1 })
    .select('entryNo')
    .lean();
  if (!last?.entryNo) return `${OPENING_STOCK_ENTRY_PREFIX}-000001`;
  const match = last.entryNo.match(/-(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `${OPENING_STOCK_ENTRY_PREFIX}-${num.toString().padStart(6, '0')}`;
}

export interface OpeningStockBatchInput {
  productId: string;
  productCode?: string;
  productName?: string;
  batchNumber?: string;
  purchasePrice: number;
  quantity: number;
  discAmount?: number;
  expiryDate?: string;
  retail?: number;
  wholesale?: number;
  specialPrice1?: number;
  specialPrice2?: number;
  multiUnitId?: string;
}

export interface CreateOpeningStockEntryInput {
  companyId: string;
  financialYearId: string;
  date?: string;
  vatType?: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  narration?: string;
  batches: OpeningStockBatchInput[];
  createdBy?: string;
}

function createInvTxnsAndVoucher(
  companyId: string,
  financialYearId: string,
  entryId: mongoose.Types.ObjectId,
  entryNo: string,
  date: Date,
  batches: Array<{ productId: mongoose.Types.ObjectId; quantity: number; purchasePrice: number; discAmount: number }>,
  userId?: string
): Promise<string | undefined> {
  let totalStockValue = 0;
  const invTxns: Array<{
    companyId: string;
    financialYearId: string;
    productId: mongoose.Types.ObjectId;
    date: Date;
    type: 'Opening';
    quantityIn: number;
    quantityOut: number;
    costPrice: number;
    referenceType: string;
    referenceId: mongoose.Types.ObjectId;
    narration: string;
    createdBy?: string;
  }> = [];

  for (const b of batches) {
    const costPrice = b.purchasePrice - (b.discAmount / b.quantity) || b.purchasePrice;
    totalStockValue += b.quantity * costPrice;
    invTxns.push({
      companyId,
      financialYearId,
      productId: b.productId,
      date,
      type: 'Opening',
      quantityIn: b.quantity,
      quantityOut: 0,
      costPrice,
      referenceType: 'OpeningStockEntry',
      referenceId: entryId,
      narration: `Opening Stock ${entryNo}`,
      createdBy: userId,
    });
  }

  return InventoryTransaction.insertMany(invTxns).then(async () => {
    const stockAccount = await LedgerAccount.findOne({ companyId, code: /STOCK|INVENTORY/i, type: 'Other' });
    const equityGroup = await LedgerAccount.findOne({ companyId, code: /EQUITY|CAPITAL/i });
    const stockLedgerId = stockAccount?._id.toString();
    const equityLedgerId = equityGroup?._id.toString();
    if (!stockLedgerId || !equityLedgerId || totalStockValue <= 0) return undefined;
    const voucher = await voucherService.createAndPost({
      companyId,
      financialYearId,
      voucherType: 'Opening',
      date,
      narration: `Opening Stock ${entryNo}`,
      lines: [
        { ledgerAccountId: stockLedgerId, debitAmount: totalStockValue, creditAmount: 0 },
        { ledgerAccountId: equityLedgerId, debitAmount: 0, creditAmount: totalStockValue },
      ],
      createdBy: userId,
    });
    return voucher._id.toString();
  });
}

export async function createOpeningStockEntry(
  input: CreateOpeningStockEntryInput
): Promise<{ entryId: string; entryNo: string }> {
  const company = await Company.findById(input.companyId);
  if (!company) throw new AppError('Company not found', 404);
  if (!input.batches || input.batches.length === 0) throw new AppError('At least one batch is required', 400);

  const entryNo = await getNextOpeningStockEntryNo(input.companyId, input.financialYearId);
  const date = input.date ? new Date(input.date) : new Date();

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
    const product = await Product.findOne({ _id: b.productId, companyId: input.companyId });
    if (!product) throw new AppError(`Product not found: ${b.productId}`, 404);
    const disc = b.discAmount ?? 0;
    const gross = b.quantity * b.purchasePrice;
    totalAmount += gross - disc;
    batchDocs.push({
      productId: product._id,
      productCode: b.productCode ?? product.code ?? '',
      productName: b.productName ?? product.name ?? '',
      batchNumber: b.batchNumber ?? '',
      purchasePrice: b.purchasePrice,
      quantity: b.quantity,
      discAmount: disc,
      expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
      retail: b.retail ?? 0,
      wholesale: b.wholesale ?? 0,
      specialPrice1: b.specialPrice1 ?? 0,
      specialPrice2: b.specialPrice2 ?? 0,
      multiUnitId: b.multiUnitId,
    });
  }

  const doc = await OpeningStockEntry.create({
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    entryNo,
    date,
    vatType: input.vatType ?? 'Vat',
    taxMode: input.taxMode ?? 'inclusive',
    narration: input.narration ?? 'Opening stock',
    batches: batchDocs,
    totalAmount: parseFloat(totalAmount.toFixed(2)),
    createdBy: input.createdBy,
  });

  const voucherId = await createInvTxnsAndVoucher(
    input.companyId,
    input.financialYearId,
    doc._id,
    entryNo,
    date,
    batchDocs.map((b) => ({
      productId: b.productId,
      quantity: b.quantity,
      purchasePrice: b.purchasePrice,
      discAmount: b.discAmount,
    })),
    input.createdBy
  );
  if (voucherId) await OpeningStockEntry.updateOne({ _id: doc._id }, { voucherId: new mongoose.Types.ObjectId(voucherId) });

  return { entryId: doc._id.toString(), entryNo };
}

export async function listOpeningStockEntries(
  companyId: string,
  financialYearId: string
): Promise<Array<{ _id: string; entryNo: string; date: string; totalAmount: number }>> {
  const list = await OpeningStockEntry.find({ companyId, financialYearId })
    .sort({ date: 1, createdAt: 1 })
    .limit(500)
    .lean();
  return list.map((doc) => ({
    _id: doc._id.toString(),
    entryNo: doc.entryNo,
    date: doc.date.toISOString().split('T')[0],
    totalAmount: doc.totalAmount ?? 0,
  }));
}

export async function getOpeningStockEntryById(
  entryId: string,
  companyId: string
): Promise<{
  _id: string;
  entryNo: string;
  date: string;
  vatType: string;
  taxMode: string;
  narration: string;
  totalAmount: number;
  batches: Array<{
    productId: string;
    productCode: string;
    productName: string;
    batchNumber: string;
    purchasePrice: number;
    quantity: number;
    discAmount: number;
    expiryDate?: string;
    retail: number;
    wholesale: number;
    specialPrice1: number;
    specialPrice2: number;
    multiUnitId?: string;
  }>;
} | null> {
  const doc = await OpeningStockEntry.findOne({ _id: entryId, companyId }).lean();
  if (!doc) return null;
  return {
    _id: doc._id.toString(),
    entryNo: doc.entryNo,
    date: doc.date.toISOString().split('T')[0],
    vatType: doc.vatType ?? 'Vat',
    taxMode: doc.taxMode ?? 'inclusive',
    narration: doc.narration ?? '',
    totalAmount: doc.totalAmount ?? 0,
    batches: (doc.batches || []).map((b: any) => ({
      productId: b.productId.toString(),
      productCode: b.productCode ?? '',
      productName: b.productName ?? '',
      batchNumber: b.batchNumber ?? '',
      purchasePrice: b.purchasePrice,
      quantity: b.quantity,
      discAmount: b.discAmount ?? 0,
      expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString().split('T')[0] : undefined,
      retail: b.retail ?? 0,
      wholesale: b.wholesale ?? 0,
      specialPrice1: b.specialPrice1 ?? 0,
      specialPrice2: b.specialPrice2 ?? 0,
      multiUnitId: b.multiUnitId,
    })),
  };
}

export async function updateOpeningStockEntry(
  entryId: string,
  companyId: string,
  input: CreateOpeningStockEntryInput
): Promise<{ entryId: string; entryNo: string }> {
  const doc = await OpeningStockEntry.findOne({ _id: entryId, companyId });
  if (!doc) throw new AppError('Opening stock entry not found', 404);
  if (!input.batches || input.batches.length === 0) throw new AppError('At least one batch is required', 400);

  const entryNo = doc.entryNo;
  const date = input.date ? new Date(input.date) : doc.date;

  await InventoryTransaction.deleteMany({ referenceType: 'OpeningStockEntry', referenceId: doc._id });

  if (doc.voucherId) {
    const { LedgerEntry } = await import('../models/LedgerEntry');
    await LedgerEntry.deleteMany({ voucherId: doc.voucherId });
    await voucherService.deleteVoucher(doc.voucherId.toString());
  }

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
    const product = await Product.findOne({ _id: b.productId, companyId: input.companyId });
    if (!product) throw new AppError(`Product not found: ${b.productId}`, 404);
    const disc = b.discAmount ?? 0;
    const gross = b.quantity * b.purchasePrice;
    totalAmount += gross - disc;
    batchDocs.push({
      productId: product._id,
      productCode: b.productCode ?? product.code ?? '',
      productName: b.productName ?? product.name ?? '',
      batchNumber: b.batchNumber ?? '',
      purchasePrice: b.purchasePrice,
      quantity: b.quantity,
      discAmount: disc,
      expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
      retail: b.retail ?? 0,
      wholesale: b.wholesale ?? 0,
      specialPrice1: b.specialPrice1 ?? 0,
      specialPrice2: b.specialPrice2 ?? 0,
      multiUnitId: b.multiUnitId,
    });
  }

  await OpeningStockEntry.updateOne(
    { _id: entryId, companyId },
    {
      $set: {
        date,
        vatType: input.vatType ?? 'Vat',
        taxMode: input.taxMode ?? 'inclusive',
        narration: input.narration ?? 'Opening stock',
        batches: batchDocs,
        totalAmount: parseFloat(totalAmount.toFixed(2)),
      },
      $unset: { voucherId: 1 },
    }
  );

  const voucherId = await createInvTxnsAndVoucher(
    input.companyId,
    input.financialYearId,
    doc._id,
    entryNo,
    date,
    batchDocs.map((b) => ({
      productId: b.productId,
      quantity: b.quantity,
      purchasePrice: b.purchasePrice,
      discAmount: b.discAmount,
    })),
    input.createdBy
  );
  if (voucherId) await OpeningStockEntry.updateOne({ _id: entryId, companyId }, { voucherId: new mongoose.Types.ObjectId(voucherId) });

  return { entryId, entryNo };
}

export async function deleteOpeningStockEntry(entryId: string, companyId: string): Promise<boolean> {
  const doc = await OpeningStockEntry.findOne({ _id: entryId, companyId });
  if (!doc) return false;
  await InventoryTransaction.deleteMany({ referenceType: 'OpeningStockEntry', referenceId: doc._id });
  if (doc.voucherId) {
    const { LedgerEntry } = await import('../models/LedgerEntry');
    await LedgerEntry.deleteMany({ voucherId: doc.voucherId });
    await voucherService.deleteVoucher(doc.voucherId.toString());
  }
  const result = await OpeningStockEntry.deleteOne({ _id: entryId, companyId });
  return result.deletedCount > 0;
}
