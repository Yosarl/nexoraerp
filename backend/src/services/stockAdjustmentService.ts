import mongoose from 'mongoose';
import { StockAdjustment, IStockAdjustment, IStockAdjustmentItem, AdjustmentType } from '../models/StockAdjustment';
import { Product } from '../models/Product';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { LedgerAccount } from '../models/LedgerAccount';
import { LedgerGroup } from '../models/LedgerGroup';
import { Company } from '../models/Company';
import { Voucher } from '../models/Voucher';
import { LedgerEntry } from '../models/LedgerEntry';
import { AppError } from '../middlewares/errorHandler';
import * as stockService from './stockService';
import * as voucherService from './voucherService';
import { getOpeningPurchaseAccount } from './openingPurchaseService';

// ─── Helper: Find or create child group under primary head ────
async function findOrCreateChildGroup(
  companyId: string,
  parentCode: string,
  parentName: string,
  groupCode: string,
  groupName: string,
  groupType: string
) {
  // 1. Ensure parent primary head exists
  let parentHead = await LedgerGroup.findOne({
    companyId,
    $or: [
      { code: parentCode },
      { name: new RegExp(`^${parentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), parentGroupId: null },
      { name: new RegExp(`^${parentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    ],
  });
  if (!parentHead) {
    parentHead = await LedgerGroup.create({
      companyId,
      name: parentName,
      code: parentCode,
      type: groupType.toUpperCase() as any,
    });
  }

  // 2. Look for child group
  let group = await LedgerGroup.findOne({
    companyId,
    $or: [
      { code: groupCode },
      { name: new RegExp(`^${groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), parentGroupId: { $ne: null } },
      { name: new RegExp(`^${groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    ],
  });

  if (group) {
    // If it has no parentGroupId, make sure it is linked under parentHead
    if (!group.parentGroupId) {
      await LedgerGroup.updateOne({ _id: group._id }, { $set: { parentGroupId: parentHead._id } });
      group.parentGroupId = parentHead._id as any;
    }
    return group;
  }

  group = await LedgerGroup.create({
    companyId,
    name: groupName,
    code: groupCode,
    type: groupType.toUpperCase() as any,
    parentGroupId: parentHead._id,
  });
  return group;
}


export async function findOrCreateDamageExpenseLedger(companyId: string): Promise<any> {
  const expGroup = await findOrCreateChildGroup(
    companyId,
    'DIR_EXP',
    'Direct Expense',
    'DIR_EXP_AC',
    'DIRECT EXPENSES A/C',
    'EXPENSE'
  );

  let acc = await LedgerAccount.findOne({
    companyId,
    name: /^(damage\s*account|damage\s*a\/?c|damage|stock\s*adjustment)$/i,
  });
  if (acc) {
    const shouldRename = acc.name.toUpperCase() !== 'DAMAGE ACCOUNT';
    if (acc.groupId?.toString() !== expGroup._id.toString() || acc.type !== 'Expense' || shouldRename) {
      await LedgerAccount.updateOne(
        { _id: acc._id },
        { $set: { groupId: expGroup._id, type: 'Expense', name: 'DAMAGE ACCOUNT' } }
      );
      acc.groupId = expGroup._id;
      acc.type = 'Expense';
      acc.name = 'DAMAGE ACCOUNT';
    }
    return acc;
  }

  acc = await LedgerAccount.create({
    companyId,
    name: 'DAMAGE ACCOUNT',
    code: 'DMG001',
    type: 'Expense',
    groupId: expGroup._id,
  });
  return acc;
}

export const findOrCreateStockAdjustmentExpenseLedger = findOrCreateDamageExpenseLedger;

export async function findOrCreateStockAdjustmentCapitalLedger(companyId: string): Promise<any> {
  const capGroup = await findOrCreateChildGroup(
    companyId,
    'CAPITAL',
    'Capital',
    'GRP0005',
    'CAPITAL ACCOUNT',
    'EQUITY'
  );

  let acc = await LedgerAccount.findOne({
    companyId,
    name: /^(stock\s*adjustment(\s*a\/?c|\s*account)?)$/i,
  });

  if (acc) {
    if (acc.groupId?.toString() !== capGroup._id.toString() || acc.name !== 'STOCK ADJUSTMENT A/C') {
      await LedgerAccount.updateOne(
        { _id: acc._id },
        { $set: { groupId: capGroup._id, type: 'Other', name: 'STOCK ADJUSTMENT A/C' } }
      );
      acc.groupId = capGroup._id;
      acc.type = 'Other';
      acc.name = 'STOCK ADJUSTMENT A/C';
    }
    return acc;
  }

  acc = await LedgerAccount.create({
    companyId,
    name: 'STOCK ADJUSTMENT A/C',
    code: 'STKADJ001',
    type: 'Other',
    groupId: capGroup._id,
  });
  return acc;
}


// ─── Get Next Adjustment Number ───────────────────────────────
export async function getNextAdjustmentNo(
  companyId: string,
  financialYearId: string,
  prefix: string = 'ADJ'
): Promise<string> {
  const pfx = (prefix || 'ADJ').toUpperCase();
  const regex = new RegExp(`^${pfx}-(\\d+)$`);
  const docs = await StockAdjustment.find({
    companyId,
    financialYearId,
    adjustmentNo: regex,
  })
    .select('adjustmentNo')
    .lean();

  let maxNum = 0;
  for (const doc of docs) {
    const m = doc.adjustmentNo.match(regex);
    if (m && m[1]) {
      const val = parseInt(m[1], 10);
      if (val > maxNum) maxNum = val;
    }
  }

  let nextNum = maxNum + 1;
  let candidate = `${pfx}-${nextNum.toString().padStart(5, '0')}`;
  while (await StockAdjustment.exists({ companyId, financialYearId, adjustmentNo: candidate })) {
    nextNum++;
    candidate = `${pfx}-${nextNum.toString().padStart(5, '0')}`;
  }

  return candidate;
}

// ─── Create Stock Adjustment Input Interface ──────────────────
export interface CreateStockAdjustmentInput {
  companyId: string;
  financialYearId: string;
  adjustmentNo?: string;
  entryType?: 'ADJUSTMENT' | 'DAMAGE';
  prefix?: string;
  date: string;
  reason: string;
  narration?: string;
  items: Array<{
    productId: string;
    productCode?: string;
    productName?: string;
    barcode?: string;
    batchNumber?: string;
    adjustmentType: AdjustmentType;
    quantity: number;
    costPrice?: number;
    reason?: string;
  }>;
  createdBy?: string;
}

async function getLiveStockForAdjustment(companyId: string, productId: any, batchNumber?: string): Promise<number> {
  if (batchNumber && String(batchNumber).trim()) {
    const agg = await InventoryTransaction.aggregate([
      {
        $match: {
          companyId: new mongoose.Types.ObjectId(companyId),
          productId: new mongoose.Types.ObjectId(productId),
          batchNumber: String(batchNumber).trim(),
        },
      },
      {
        $group: {
          _id: '$batchNumber',
          totalIn: { $sum: '$quantityIn' },
          totalOut: { $sum: '$quantityOut' },
        },
      },
    ]);
    if (agg.length > 0) {
      return (agg[0].totalIn || 0) - (agg[0].totalOut || 0);
    }
    return 0;
  }
  return stockService.getProductStock(companyId, productId.toString());
}

// ─── Create Stock Adjustment ──────────────────────────────────
export async function createStockAdjustment(
  input: CreateStockAdjustmentInput,
  userId?: string
): Promise<IStockAdjustment> {
  const company = await Company.findById(input.companyId);
  if (!company) throw new AppError('Company not found', 404);
  if (!input.items || input.items.length === 0) {
    throw new AppError('At least one item is required for adjustment', 400);
  }

  const date = input.date ? new Date(input.date) : new Date();
  const entryType = input.entryType || (input.prefix === 'DMG' || (input.reason && /damage/i.test(input.reason)) ? 'DAMAGE' : 'ADJUSTMENT');
  const pfx = input.prefix ? input.prefix.toUpperCase() : entryType === 'DAMAGE' ? 'DMG' : 'ADJ';

  let adjustmentNo: string;
  if (input.adjustmentNo && !(await StockAdjustment.exists({ companyId: input.companyId, financialYearId: input.financialYearId, adjustmentNo: input.adjustmentNo }))) {
    adjustmentNo = input.adjustmentNo;
  } else {
    adjustmentNo = await getNextAdjustmentNo(input.companyId, input.financialYearId, pfx);
  }

  let totalLossValue = 0;
  let totalGainValue = 0;
  const processedItems: IStockAdjustmentItem[] = [];

  for (const item of input.items) {
    const product = await Product.findOne({ _id: item.productId, companyId: input.companyId });
    if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new AppError(`Invalid quantity for product ${product.name}`, 400);
    }

    // Get current live stock (batch-specific if batch is present)
    const currentStock = await getLiveStockForAdjustment(input.companyId, product._id, item.batchNumber);
    const costPrice = item.costPrice != null && item.costPrice > 0 ? Number(item.costPrice) : (product.purchasePrice || 0);
    const lineTotal = parseFloat((qty * costPrice).toFixed(2));

    let newStock = currentStock;
    if (item.adjustmentType === 'ADD') {
      newStock = currentStock + qty;
      totalGainValue += lineTotal;
      if (costPrice > 0 && (!product.purchasePrice || product.purchasePrice <= 0)) {
        await Product.updateOne({ _id: product._id }, { $set: { purchasePrice: costPrice } });
      }
    } else if (item.adjustmentType === 'REDUCE') {
      newStock = currentStock - qty;
      totalLossValue += lineTotal;
    } else {
      throw new AppError(`Invalid adjustment type for product ${product.name}`, 400);
    }

    processedItems.push({
      productId: product._id,
      productCode: item.productCode || product.code || '',
      productName: item.productName || product.name || '',
      barcode: item.barcode || product.systemBarcode || product.internationalBarcode || '',
      batchNumber: item.batchNumber || '',
      currentStock,
      adjustmentType: item.adjustmentType,
      quantity: qty,
      newStock,
      costPrice,
      totalValue: lineTotal,
      reason: item.reason || '',
    });
  }

  totalLossValue = parseFloat(totalLossValue.toFixed(2));
  totalGainValue = parseFloat(totalGainValue.toFixed(2));
  const netAdjustmentValue = parseFloat((totalGainValue - totalLossValue).toFixed(2));

  // 1. Create StockAdjustment document
  const adjustmentDoc = await StockAdjustment.create({
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    adjustmentNo,
    entryType,
    date,
    reason: input.reason || 'Physical Discrepancy',
    narration: input.narration || '',
    items: processedItems,
    totalItems: processedItems.length,
    totalLossValue,
    totalGainValue,
    netAdjustmentValue,
    createdBy: userId,
  });

  // 2. Insert Inventory Transactions for live stock tracking
  const invTxns = processedItems.map((item) => ({
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    productId: item.productId,
    date,
    type: (input.reason && /damage/i.test(input.reason) ? 'Damage' : 'Adjustment') as any,
    quantityIn: item.adjustmentType === 'ADD' ? item.quantity : 0,
    quantityOut: item.adjustmentType === 'REDUCE' ? item.quantity : 0,
    costPrice: item.costPrice,
    batchNumber: item.batchNumber || undefined,
    referenceType: 'StockAdjustment',
    referenceId: adjustmentDoc._id,
    narration: `Stock Adjustment ${adjustmentNo} (${item.adjustmentType} ${item.quantity} ${item.productName})`,
    createdBy: userId,
  }));

  await InventoryTransaction.insertMany(invTxns);

  // 3. Post Accounting Journal Voucher if there is financial value
  const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];

  const openingPurchaseAcc = await getOpeningPurchaseAccount(input.companyId);
  const stockAdjCapitalLedger = await findOrCreateStockAdjustmentCapitalLedger(input.companyId);

  // Stock Reduction (Loss / Damage)
  const isDamage =
    entryType === 'DAMAGE' ||
    (input.reason && /damage|wastage|expired|spoilage|breakage/i.test(input.reason));

  if (totalLossValue > 0.001) {
    if (isDamage) {
      const damageLedger = await findOrCreateDamageExpenseLedger(input.companyId);
      voucherLines.push({
        ledgerAccountId: damageLedger._id.toString(),
        debitAmount: totalLossValue,
        creditAmount: 0,
        narration: `Damage Entry ${adjustmentNo}`,
      });
      voucherLines.push({
        ledgerAccountId: openingPurchaseAcc._id.toString(),
        debitAmount: 0,
        creditAmount: totalLossValue,
        narration: `Opening Purchase reduction (Damage) ${adjustmentNo}`,
      });
    } else {
      voucherLines.push({
        ledgerAccountId: stockAdjCapitalLedger._id.toString(),
        debitAmount: totalLossValue,
        creditAmount: 0,
        narration: `Stock Adjustment Minus ${adjustmentNo}`,
      });
      voucherLines.push({
        ledgerAccountId: openingPurchaseAcc._id.toString(),
        debitAmount: 0,
        creditAmount: totalLossValue,
        narration: `Opening Purchase reduction (Stock Adjustment) ${adjustmentNo}`,
      });
    }
  }

  // Stock Addition (Surplus / Gain) -> Stock Adjustment Plus
  if (totalGainValue > 0.001) {
    voucherLines.push({
      ledgerAccountId: openingPurchaseAcc._id.toString(),
      debitAmount: totalGainValue,
      creditAmount: 0,
      narration: `Opening Purchase addition (Stock Adjustment) ${adjustmentNo}`,
    });
    voucherLines.push({
      ledgerAccountId: stockAdjCapitalLedger._id.toString(),
      debitAmount: 0,
      creditAmount: totalGainValue,
      narration: `Stock Adjustment Plus ${adjustmentNo}`,
    });
  }

  if (voucherLines.length > 0) {
    try {
      const voucherNarration =
        input.narration ||
        (isDamage
          ? `Damage Entry ${adjustmentNo} - ${input.reason || 'Damaged Goods'}`
          : `Stock Adjustment ${adjustmentNo} - ${input.reason || 'Inventory Count Difference'}`);

      const voucher = await voucherService.createAndPost({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        voucherType: 'Journal',
        date,
        narration: voucherNarration,
        lines: voucherLines,
        referenceType: 'StockAdjustment',
        referenceId: adjustmentDoc._id.toString(),
        referenceNo: adjustmentNo,
        createdBy: userId,
      });

      adjustmentDoc.voucherId = voucher._id as mongoose.Types.ObjectId;
      await adjustmentDoc.save();
    } catch (vErr) {
      console.error('[StockAdjustment] Failed to create journal voucher:', vErr);
    }
  }

  return adjustmentDoc;
}

// ─── List Stock Adjustments ───────────────────────────────────
export async function listStockAdjustments(
  companyId: string,
  financialYearId: string,
  opts?: {
    search?: string;
    page?: number;
    limit?: number;
    fromDate?: string;
    toDate?: string;
    entryType?: 'ADJUSTMENT' | 'DAMAGE';
    prefix?: string;
    productId?: string;
  }
): Promise<{ list: IStockAdjustment[]; total: number }> {
  const conditions: any[] = [
    { companyId: new mongoose.Types.ObjectId(companyId), financialYearId: new mongoose.Types.ObjectId(financialYearId) },
  ];

  if (opts?.productId && mongoose.Types.ObjectId.isValid(opts.productId)) {
    conditions.push({ 'items.productId': new mongoose.Types.ObjectId(opts.productId) });
  }

  if (opts?.fromDate || opts?.toDate) {
    const dateQuery: any = {};
    if (opts.fromDate) {
      const fd = new Date(opts.fromDate);
      fd.setHours(0, 0, 0, 0);
      dateQuery.$gte = fd;
    }
    if (opts.toDate) {
      const td = new Date(opts.toDate);
      td.setHours(23, 59, 59, 999);
      dateQuery.$lte = td;
    }
    conditions.push({ date: dateQuery });
  }

  if (opts?.entryType === 'DAMAGE' || opts?.prefix === 'DMG') {
    conditions.push({
      $or: [
        { entryType: 'DAMAGE' },
        { adjustmentNo: /^DMG-/i },
        { reason: /^(damage|wastage|expired|spoilage|breakage|scrap|defective)/i },
      ],
    });
  } else if (opts?.entryType === 'ADJUSTMENT' || opts?.prefix === 'ADJ') {
    conditions.push({
      $and: [
        { adjustmentNo: { $not: /^DMG-/i } },
        { entryType: { $ne: 'DAMAGE' } },
      ],
    });
  }

  if (opts?.search) {
    const s = opts.search.trim();
    conditions.push({
      $or: [
        { adjustmentNo: new RegExp(s, 'i') },
        { reason: new RegExp(s, 'i') },
        { narration: new RegExp(s, 'i') },
        { 'items.productName': new RegExp(s, 'i') },
        { 'items.productCode': new RegExp(s, 'i') },
        { 'items.barcode': new RegExp(s, 'i') },
      ],
    });
  }

  const query = conditions.length === 1 ? conditions[0] : { $and: conditions };

  const page = opts?.page || 1;
  const limit = opts?.limit || 50;
  const skip = (page - 1) * limit;

  const [list, total] = await Promise.all([
    StockAdjustment.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'username fullName')
      .populate('voucherId', 'voucherNo')
      .lean(),
    StockAdjustment.countDocuments(query),
  ]);

  return { list: list as unknown as IStockAdjustment[], total };
}

// ─── Get Stock Adjustment by ID ───────────────────────────────
export async function getStockAdjustmentById(
  id: string,
  companyId: string
): Promise<IStockAdjustment | null> {
  const doc = await StockAdjustment.findOne({ _id: id, companyId })
    .populate('createdBy', 'username fullName')
    .populate('voucherId', 'voucherNo lines')
    .lean();
  return doc as unknown as IStockAdjustment | null;
}

// ─── Delete Stock Adjustment (Reverse inventory & vouchers) ───
export async function deleteStockAdjustment(
  id: string,
  companyId: string,
  userId?: string
): Promise<boolean> {
  const doc = await StockAdjustment.findOne({ _id: id, companyId });
  if (!doc) throw new AppError('Stock adjustment not found', 404);

  // 1. Delete associated inventory transactions
  await InventoryTransaction.deleteMany({
    companyId,
    referenceType: 'StockAdjustment',
    referenceId: doc._id,
  });

  // 2. Delete associated journal voucher and ledger entries if exists
  if (doc.voucherId) {
    await LedgerEntry.deleteMany({ voucherId: doc.voucherId });
    await Voucher.deleteOne({ _id: doc.voucherId });
  }

  // 3. Delete StockAdjustment
  await StockAdjustment.deleteOne({ _id: doc._id });
  return true;
}

// ─── Update Stock Adjustment ──────────────────────────────────
export async function updateStockAdjustment(
  id: string,
  input: CreateStockAdjustmentInput,
  userId?: string
): Promise<IStockAdjustment> {
  const doc = await StockAdjustment.findOne({ _id: id, companyId: input.companyId });
  if (!doc) throw new AppError('Stock adjustment not found', 404);

  // 1. Delete existing inventory transactions
  await InventoryTransaction.deleteMany({
    companyId: input.companyId,
    referenceType: 'StockAdjustment',
    referenceId: doc._id,
  });

  // 2. Delete existing journal voucher & ledger entries
  if (doc.voucherId) {
    await LedgerEntry.deleteMany({ voucherId: doc.voucherId });
    await Voucher.deleteOne({ _id: doc.voucherId });
    doc.voucherId = undefined;
  }

  // 3. Process new items
  const date = input.date ? new Date(input.date) : new Date();
  let totalLossValue = 0;
  let totalGainValue = 0;
  const processedItems: IStockAdjustmentItem[] = [];

  for (const item of input.items) {
    const product = await Product.findOne({ _id: item.productId, companyId: input.companyId });
    if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      throw new AppError(`Invalid quantity for product ${product.name}`, 400);
    }

    // Get current live stock (batch-specific if batch is present)
    const currentStock = await getLiveStockForAdjustment(input.companyId, product._id, item.batchNumber);
    const costPrice = item.costPrice != null && item.costPrice > 0 ? Number(item.costPrice) : (product.purchasePrice || 0);
    const lineTotal = parseFloat((qty * costPrice).toFixed(2));

    let newStock = currentStock;
    if (item.adjustmentType === 'ADD') {
      newStock = currentStock + qty;
      totalGainValue += lineTotal;
    } else if (item.adjustmentType === 'REDUCE') {
      newStock = currentStock - qty;
      totalLossValue += lineTotal;
    } else {
      throw new AppError(`Invalid adjustment type for product ${product.name}`, 400);
    }

    processedItems.push({
      productId: product._id,
      productCode: item.productCode || product.code || '',
      productName: item.productName || product.name || '',
      barcode: item.barcode || product.systemBarcode || product.internationalBarcode || '',
      batchNumber: item.batchNumber || '',
      currentStock,
      adjustmentType: item.adjustmentType,
      quantity: qty,
      newStock,
      costPrice,
      totalValue: lineTotal,
      reason: item.reason || '',
    });
  }

  totalLossValue = parseFloat(totalLossValue.toFixed(2));
  totalGainValue = parseFloat(totalGainValue.toFixed(2));
  const netAdjustmentValue = parseFloat((totalGainValue - totalLossValue).toFixed(2));

  // 4. Update StockAdjustment document
  doc.date = date;
  doc.reason = input.reason || 'Physical Discrepancy';
  doc.narration = input.narration || '';
  doc.items = processedItems as any;
  doc.totalItems = processedItems.length;
  doc.totalLossValue = totalLossValue;
  doc.totalGainValue = totalGainValue;
  doc.netAdjustmentValue = netAdjustmentValue;

  await doc.save();

  // 5. Insert new Inventory Transactions
  const invTxns = processedItems.map((item) => ({
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    productId: item.productId,
    date,
    type: (input.reason && /damage/i.test(input.reason) ? 'Damage' : 'Adjustment') as any,
    quantityIn: item.adjustmentType === 'ADD' ? item.quantity : 0,
    quantityOut: item.adjustmentType === 'REDUCE' ? item.quantity : 0,
    costPrice: item.costPrice,
    batchNumber: item.batchNumber || undefined,
    referenceType: 'StockAdjustment',
    referenceId: doc._id,
    narration: `Stock Adjustment ${doc.adjustmentNo} (${item.adjustmentType} ${item.quantity} ${item.productName})`,
    createdBy: userId,
  }));

  await InventoryTransaction.insertMany(invTxns);

  // 6. Post Accounting Journal Voucher
  const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];
  const openingPurchaseAcc = await getOpeningPurchaseAccount(input.companyId);
  const stockAdjCapitalLedger = await findOrCreateStockAdjustmentCapitalLedger(input.companyId);

  const isDamage =
    doc.entryType === 'DAMAGE' ||
    input.entryType === 'DAMAGE' ||
    (input.reason && /damage|wastage|expired|spoilage|breakage/i.test(input.reason));

  if (totalLossValue > 0.001) {
    if (isDamage) {
      const damageLedger = await findOrCreateDamageExpenseLedger(input.companyId);
      voucherLines.push({
        ledgerAccountId: damageLedger._id.toString(),
        debitAmount: totalLossValue,
        creditAmount: 0,
        narration: `Damage Entry ${doc.adjustmentNo}`,
      });
      voucherLines.push({
        ledgerAccountId: openingPurchaseAcc._id.toString(),
        debitAmount: 0,
        creditAmount: totalLossValue,
        narration: `Opening Purchase reduction (Damage) ${doc.adjustmentNo}`,
      });
    } else {
      voucherLines.push({
        ledgerAccountId: stockAdjCapitalLedger._id.toString(),
        debitAmount: totalLossValue,
        creditAmount: 0,
        narration: `Stock Adjustment Minus ${doc.adjustmentNo}`,
      });
      voucherLines.push({
        ledgerAccountId: openingPurchaseAcc._id.toString(),
        debitAmount: 0,
        creditAmount: totalLossValue,
        narration: `Opening Purchase reduction (Stock Adjustment) ${doc.adjustmentNo}`,
      });
    }
  }

  if (totalGainValue > 0.001) {
    voucherLines.push({
      ledgerAccountId: openingPurchaseAcc._id.toString(),
      debitAmount: totalGainValue,
      creditAmount: 0,
      narration: `Opening Purchase addition (Stock Adjustment) ${doc.adjustmentNo}`,
    });
    voucherLines.push({
      ledgerAccountId: stockAdjCapitalLedger._id.toString(),
      debitAmount: 0,
      creditAmount: totalGainValue,
      narration: `Stock Adjustment Plus ${doc.adjustmentNo}`,
    });
  }

  if (voucherLines.length > 0) {
    try {
      const voucherNarration =
        input.narration ||
        (isDamage
          ? `Damage Entry ${doc.adjustmentNo} - ${input.reason || 'Damaged Goods'}`
          : `Stock Adjustment ${doc.adjustmentNo} - ${input.reason || 'Inventory Count Difference'}`);

      const voucher = await voucherService.createAndPost({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        voucherType: 'Journal',
        date,
        narration: voucherNarration,
        lines: voucherLines,
        referenceType: 'StockAdjustment',
        referenceId: doc._id.toString(),
        referenceNo: doc.adjustmentNo,
        createdBy: userId,
      });

      doc.voucherId = voucher._id as mongoose.Types.ObjectId;
      await doc.save();
    } catch (vErr) {
      console.error('[StockAdjustment] Failed to create journal voucher on update:', vErr);
    }
  }

  return doc;
}
