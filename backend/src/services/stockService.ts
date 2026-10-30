import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { User } from '../models/User';
import { PurchaseInvoice } from '../models/PurchaseInvoice';
import { ProductCategory } from '../models/ProductCategory';
import { UnitOfMeasure } from '../models/UnitOfMeasure';
import { LedgerAccount } from '../models/LedgerAccount';
import { SalesInvoice } from '../models/SalesInvoice';
import { PurchaseReturn } from '../models/PurchaseReturn';
import { StockAdjustment } from '../models/StockAdjustment';
import { OpeningPurchaseEntry } from '../models/OpeningPurchaseEntry';
import { Voucher } from '../models/Voucher';

export interface StockReportItem {
  rowId: string;
  productId: string;
  imei: string;
  itemName: string;
  batchNumber?: string | null;
  itemGroup: string;
  brand: string;
  category: string;
  qtyAvailable: number;
  purchaseRate: number;
  totalPurchaseRate: number;
  grossValue: number;
  sellingPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  specialPrice1: number;
  specialPrice2: number;
  expiryDate: string | null;
  branch: string;
  sellerName: string;
}

// All searchable string fields on the final StockReportItem
const STRING_FIELDS: (keyof StockReportItem)[] = [
  'itemName', 'imei', 'batchNumber', 'itemGroup', 'brand', 'category', 'branch', 'sellerName', 'expiryDate',
];

// All searchable numeric fields on the final StockReportItem
const NUMERIC_FIELDS: (keyof StockReportItem)[] = [
  'qtyAvailable', 'purchaseRate', 'totalPurchaseRate', 'grossValue', 'sellingPrice',
  'retailPrice', 'wholesalePrice', 'specialPrice1', 'specialPrice2',
];

type TaxMode = 'inclusive' | 'exclusive';
interface PurchaseTaxInfo {
  taxMode: TaxMode;
  vatType: 'Vat' | 'NonVat';
}

function productVatPercent(prod: { vatCategory?: string; vatPercent?: number }): number {
  const isVatApplicable = prod.vatCategory !== 'zero' && prod.vatCategory !== 'exempt' && (prod.vatPercent || 0) > 0;
  return isVatApplicable ? (prod.vatPercent || 0) : 0;
}

function taxFromDoc(doc: { taxMode?: string; vatType?: string } | null | undefined): PurchaseTaxInfo {
  return {
    taxMode: doc?.taxMode === 'exclusive' ? 'exclusive' : 'inclusive',
    vatType: doc?.vatType === 'NonVat' ? 'NonVat' : 'Vat',
  };
}

/** Stored purchase rate is exclusive when taxMode is exclusive, inclusive otherwise.
 *  Cost value always includes tax; gross value always excludes tax. */
function splitCostGross(storedRate: number, vatPercent: number, taxInfo?: PurchaseTaxInfo | null): { costRate: number; grossRate: number } {
  const rate = storedRate || 0;
  const vatOn = vatPercent > 0 && taxInfo?.vatType !== 'NonVat';
  if (!vatOn) return { costRate: rate, grossRate: rate };
  if (taxInfo?.taxMode === 'exclusive') {
    return {
      costRate: parseFloat((rate * (1 + vatPercent / 100)).toFixed(4)),
      grossRate: rate,
    };
  }
  return {
    costRate: rate,
    grossRate: parseFloat((rate / (1 + vatPercent / 100)).toFixed(4)),
  };
}

function taxRefKey(referenceType?: string | null, referenceId?: unknown): string | null {
  if (!referenceId) return null;
  return `${referenceType || ''}:${String(referenceId)}`;
}

function taxInfoFromTx(
  tx: { taxMode?: string; referenceType?: string; referenceId?: unknown },
  taxInfoMap: Map<string, PurchaseTaxInfo>
): PurchaseTaxInfo {
  const key = taxRefKey(tx.referenceType, tx.referenceId);
  if (key && taxInfoMap.has(key)) return taxInfoMap.get(key)!;
  if (tx.taxMode === 'exclusive' || tx.taxMode === 'inclusive') {
    return { taxMode: tx.taxMode, vatType: 'Vat' };
  }
  return { taxMode: 'inclusive', vatType: 'Vat' };
}

async function loadTaxInfoByReference(
  txs: Array<{ taxMode?: string; referenceType?: string; referenceId?: unknown }>
): Promise<Map<string, PurchaseTaxInfo>> {
  const map = new Map<string, PurchaseTaxInfo>();
  const purchaseIds: mongoose.Types.ObjectId[] = [];
  const openingIds: mongoose.Types.ObjectId[] = [];

  for (const tx of txs) {
    if (!tx.referenceId || !mongoose.Types.ObjectId.isValid(String(tx.referenceId))) continue;
    const oid = new mongoose.Types.ObjectId(String(tx.referenceId));
    if (tx.referenceType === 'Purchase') purchaseIds.push(oid);
    else if (tx.referenceType === 'OpeningPurchaseEntry') openingIds.push(oid);
  }

  if (purchaseIds.length > 0) {
    const invoices = await PurchaseInvoice.find({ _id: { $in: purchaseIds } }).select('taxMode vatType').lean();
    for (const inv of invoices) {
      const key = taxRefKey('Purchase', inv._id);
      if (!key) continue;
      map.set(key, taxFromDoc(inv));
    }
  }

  if (openingIds.length > 0) {
    const entries = await OpeningPurchaseEntry.find({ _id: { $in: openingIds } }).select('taxMode vatType').lean();
    for (const entry of entries) {
      const key = taxRefKey('OpeningPurchaseEntry', entry._id);
      if (!key) continue;
      map.set(key, taxFromDoc(entry));
    }
  }

  return map;
}

/**
 * Post-filter report items by search term across the specified field (or all fields).
 * Returns filtered items.
 */
function filterReportItems(
  items: StockReportItem[],
  search: string,
  field?: string
): StockReportItem[] {
  const searchLower = search.toLowerCase();

  if (field && field !== 'all') {
    // Search in a specific field
    const isNumeric = NUMERIC_FIELDS.includes(field as keyof StockReportItem);
    return items.filter((item) => {
      const val = item[field as keyof StockReportItem];
      if (val == null) return false;
      if (isNumeric) {
        return String(val).includes(search);
      }
      return String(val).toLowerCase().includes(searchLower);
    });
  }

  // "All" — search across every string and numeric field
  return items.filter((item) => {
    for (const f of STRING_FIELDS) {
      const val = item[f];
      if (val != null && String(val).toLowerCase().includes(searchLower)) return true;
    }
    for (const f of NUMERIC_FIELDS) {
      const val = item[f];
      if (val != null && String(val).includes(search)) return true;
    }
    return false;
  });
}

export async function getStockReport(
  companyId: string,
  opts: { search?: string; searchField?: string; page?: number; limit?: number; mode?: string; skipPagination?: boolean } = {}
): Promise<{ items: StockReportItem[]; total: number }> {
  const mode = opts.mode === 'batch' ? 'batch' : opts.mode === 'lastPurchase' ? 'lastPurchase' : 'avg';

  // Build product filter — no search at DB level; we filter after building report items
  const productFilter: Record<string, unknown> = { companyId, status: 'active' };

  // When there's a search, skip DB pagination so we can post-filter all items
  const needsPostFilter = !!opts.search;
  const fetchOpts = needsPostFilter
    ? { ...opts, skipPagination: true }
    : opts;

  let result: { items: StockReportItem[]; total: number };
  if (mode === 'batch') {
    result = await getBatchWiseReport(companyId, productFilter, fetchOpts);
  } else if (mode === 'lastPurchase') {
    result = await getLastPurchaseRateReport(companyId, productFilter, fetchOpts);
  } else {
    result = await getAvgStockReport(companyId, productFilter, fetchOpts);
  }

  // Post-filter all report items by search term across the chosen field (or all fields)
  if (needsPostFilter && opts.search) {
    result.items = filterReportItems(result.items, opts.search, opts.searchField);
    result.total = result.items.length;

    // Apply pagination manually
    const page = (opts.page || 1) - 1;
    const limit = opts.limit || 50;
    result.items = result.items.slice(page * limit, page * limit + limit);
  }

  return result;
}

// ──────────────────────────────────────────────────────────
// Avg Stock Mode – one row per product, average purchase rate
// ──────────────────────────────────────────────────────────
async function getAvgStockReport(
  companyId: string,
  productFilter: Record<string, unknown>,
  opts: { page?: number; limit?: number; skipPagination?: boolean }
): Promise<{ items: StockReportItem[]; total: number }> {
  const companyOid = new mongoose.Types.ObjectId(companyId);

  // 1. Total stock per product (all transaction types)
  const stockAgg = await InventoryTransaction.aggregate([
    { $match: { companyId: companyOid } },
    {
      $group: {
        _id: '$productId',
        totalIn: { $sum: '$quantityIn' },
        totalOut: { $sum: '$quantityOut' },
        lastCreatedBy: { $last: '$createdBy' },
      },
    },
  ]);

  const stockMap = new Map<
    string,
    { qtyAvailable: number; lastCreatedBy: string | null }
  >();
  for (const item of stockAgg) {
    stockMap.set(item._id.toString(), {
      qtyAvailable: item.totalIn - item.totalOut,
      lastCreatedBy: item.lastCreatedBy?.toString() ?? null,
    });
  }

  // 2. Average cost price from Purchase/Opening/Adjustment transactions that still have stock (FIFO)
  const purchaseTxns = await InventoryTransaction.find({
    companyId: companyOid,
    type: { $in: ['Purchase', 'Opening', 'Adjustment'] },
    quantityIn: { $gt: 0 },
    costPrice: { $gt: 0 },
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  // Group purchase transactions by product (oldest first)
  const purchaseByProduct = new Map<string, typeof purchaseTxns>();
  for (const tx of purchaseTxns) {
    const pid = tx.productId.toString();
    if (!purchaseByProduct.has(pid)) purchaseByProduct.set(pid, []);
    purchaseByProduct.get(pid)!.push(tx);
  }

  const taxInfoMap = await loadTaxInfoByReference(purchaseTxns);
  const productsForVat = await Product.find({
    _id: { $in: Array.from(purchaseByProduct.keys()).map((id) => new mongoose.Types.ObjectId(id)) },
  }).select('_id vatPercent vatCategory').lean();
  const fifoVatMap = new Map(productsForVat.map((p) => [p._id.toString(), productVatPercent(p)]));

  // For each product, use FIFO to find which batches still have stock,
  // then average only those batches' cost prices
  const avgCostMap = new Map<string, { stored: number; cost: number; gross: number }>();
  for (const [pid, batches] of purchaseByProduct) {
    const stock = stockMap.get(pid);
    const netStock = stock?.qtyAvailable ?? 0;
    const totalPurchased = batches.reduce((sum, tx) => sum + tx.quantityIn, 0);
    const totalSold = totalPurchased - netStock;
    const vatPercent = fifoVatMap.get(pid) || 0;

    let soldRemaining = Math.max(totalSold, 0);
    let totalStoredValuation = 0;
    let totalCostValuation = 0;
    let totalGrossValuation = 0;
    let totalRemainingQty = 0;

    for (const tx of batches) {
      const soldFromBatch = Math.min(tx.quantityIn, soldRemaining);
      const remainingInBatch = tx.quantityIn - soldFromBatch;
      soldRemaining -= soldFromBatch;

      if (remainingInBatch > 0 && (tx.costPrice ?? 0) > 0) {
        const { costRate, grossRate } = splitCostGross(tx.costPrice, vatPercent, taxInfoFromTx(tx, taxInfoMap));
        totalStoredValuation += remainingInBatch * tx.costPrice;
        totalCostValuation += remainingInBatch * costRate;
        totalGrossValuation += remainingInBatch * grossRate;
        totalRemainingQty += remainingInBatch;
      }
    }

    if (totalRemainingQty > 0) {
      avgCostMap.set(pid, {
        stored: totalStoredValuation / totalRemainingQty,
        cost: totalCostValuation / totalRemainingQty,
        gross: totalGrossValuation / totalRemainingQty,
      });
    } else if (batches.length > 0) {
      const last = batches[batches.length - 1];
      const { costRate, grossRate } = splitCostGross(last.costPrice ?? 0, vatPercent, taxInfoFromTx(last, taxInfoMap));
      avgCostMap.set(pid, { stored: last.costPrice ?? 0, cost: costRate, gross: grossRate });
    }
  }

  // 3. Products
  const total = await Product.countDocuments(productFilter);
  let avgQuery = Product.find(productFilter)
    .populate('categoryId', 'name code')
    .sort({ name: 1 });

  if (!opts.skipPagination) {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);
    avgQuery = avgQuery.skip((page - 1) * limit).limit(limit);
  }

  const products = await avgQuery.lean();

  // 4. Users
  const userIds = new Set<string>();
  for (const prod of products) {
    const stock = stockMap.get(prod._id.toString());
    if (stock?.lastCreatedBy) userIds.add(stock.lastCreatedBy);
    if (prod.createdBy) userIds.add(prod.createdBy.toString());
  }
  const userMap = await buildUserMap(userIds);

  // 5. Build response
  const items: StockReportItem[] = products.map((prod) => {
    const pid = prod._id.toString();
    const stock = stockMap.get(pid);
    const qtyAvailable = stock?.qtyAvailable ?? 0;
    const avg = avgCostMap.get(pid);
    const vatPercent = productVatPercent(prod);
    const fallback = splitCostGross(prod.purchasePrice ?? 0, vatPercent, { taxMode: 'inclusive', vatType: 'Vat' });
    const purchaseRate = avg?.stored ?? prod.purchasePrice ?? 0;
    const costRate = avg?.cost ?? fallback.costRate;
    const grossRate = avg?.gross ?? fallback.grossRate;
    const sellerUserId = stock?.lastCreatedBy ?? prod.createdBy?.toString() ?? null;

    const cat = prod.categoryId as any;
    const categoryName = cat && typeof cat === 'object' ? (cat.name ?? '') : '';

    const totalPurchaseRate = parseFloat((qtyAvailable * costRate).toFixed(2));
    const grossValue = parseFloat((qtyAvailable * grossRate).toFixed(2));

    return {
      rowId: pid,
      productId: pid,
      imei: prod.imei ?? '',
      itemName: prod.name,
      batchNumber: null,
      itemGroup: prod.itemGroup ?? '',
      brand: prod.brand ?? '',
      category: categoryName,
      qtyAvailable,
      purchaseRate,
      totalPurchaseRate,
      grossValue,
      sellingPrice: prod.sellingPrice ?? prod.retailPrice ?? 0,
      retailPrice: prod.retailPrice ?? 0,
      wholesalePrice: prod.wholesalePrice ?? 0,
      specialPrice1: prod.specialPrice ?? 0,
      specialPrice2: prod.specialPrice2 ?? 0,
      expiryDate: null,
      branch: 'MAIN BRANCH',
      sellerName: sellerUserId ? userMap.get(sellerUserId) ?? 'N/A' : 'N/A',
    };
  });

  return { items, total };
}

// ──────────────────────────────────────────────────────────
// Batch Wise Mode – show ALL items; items with multiple
// batches get one row per batch, others get a single row
// ──────────────────────────────────────────────────────────
async function getBatchWiseReport(
  companyId: string,
  productFilter: Record<string, unknown>,
  opts: { page?: number; limit?: number; skipPagination?: boolean }
): Promise<{ items: StockReportItem[]; total: number }> {
  const companyOid = new mongoose.Types.ObjectId(companyId);

  // 1. Get all matching products (paginated)
  const total = await Product.countDocuments(productFilter);
  let batchQuery = Product.find(productFilter)
    .populate('categoryId', 'name code')
    .sort({ name: 1 });

  if (!opts.skipPagination) {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);
    batchQuery = batchQuery.skip((page - 1) * limit).limit(limit);
  }

  const products = await batchQuery.lean();

  if (products.length === 0) return { items: [], total: 0 };

  const productIds = products.map((p) => p._id);
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  // 2. Fetch purchase invoices for batch metadata (expiryDate, purchasePrice, retail, wholesale, tax)
  const purchases = await PurchaseInvoice.find({
    companyId: companyOid,
    'batches.productId': { $in: productIds },
  })
    .select('batches date taxMode vatType')
    .lean();

  const openings = await OpeningPurchaseEntry.find({
    companyId: companyOid,
    'batches.productId': { $in: productIds },
  })
    .select('batches date taxMode vatType')
    .lean();

  const batchMetaMap = new Map<string, {
    purchasePrice?: number;
    expiryDate?: string;
    retail?: number;
    wholesale?: number;
    taxMode: TaxMode;
    vatType: 'Vat' | 'NonVat';
  }>();
  const addBatchMeta = (docs: Array<{ taxMode?: string; vatType?: string; batches?: any[] }>) => {
    for (const doc of docs) {
      const tax = taxFromDoc(doc);
      for (const b of (doc.batches || [])) {
        if (!b.productId) continue;
        const key = `${b.productId.toString()}_${String(b.batchNumber || '').trim().toLowerCase()}`;
        if (!batchMetaMap.has(key)) {
          batchMetaMap.set(key, {
            purchasePrice: b.purchasePrice,
            expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString().split('T')[0] : '',
            retail: b.retail,
            wholesale: b.wholesale,
            ...tax,
          });
        }
      }
    }
  };
  addBatchMeta(purchases);
  addBatchMeta(openings);

  // 3. Aggregate InventoryTransaction grouped by (productId, batchNumber)
  const batchStockAgg = await InventoryTransaction.aggregate([
    { $match: { companyId: companyOid, productId: { $in: productIds } } },
    {
      $group: {
        _id: {
          productId: '$productId',
          batchNumber: '$batchNumber',
        },
        totalIn: { $sum: '$quantityIn' },
        totalOut: { $sum: '$quantityOut' },
        lastCost: { $last: '$costPrice' },
        lastCreatedBy: { $last: '$createdBy' },
        lastTaxMode: { $last: '$taxMode' },
        lastReferenceType: { $last: '$referenceType' },
        lastReferenceId: { $last: '$referenceId' },
      },
    },
  ]);

  // Map by productId -> array of batches
  type BatchRow = {
    batchNumber: string;
    netQty: number;
    lastCost: number;
    lastCreatedBy: string | null;
    lastTaxMode?: string;
    lastReferenceType?: string;
    lastReferenceId?: unknown;
  };
  const batchesByProduct = new Map<string, Array<BatchRow>>();
  const productLastInflow = new Map<string, BatchRow>();
  const stockMap = new Map<string, { qtyAvailable: number; lastCreatedBy: string | null }>();
  const userIds = new Set<string>();

  for (const row of batchStockAgg) {
    const pId = row._id?.productId?.toString();
    const bNum = row._id?.batchNumber ? String(row._id.batchNumber).trim() : '';
    const net = (row.totalIn || 0) - (row.totalOut || 0);

    if (row.lastCreatedBy) userIds.add(row.lastCreatedBy.toString());

    if (pId) {
      const cur = stockMap.get(pId) || { qtyAvailable: 0, lastCreatedBy: null };
      cur.qtyAvailable += net;
      if (row.lastCreatedBy) cur.lastCreatedBy = row.lastCreatedBy.toString();
      stockMap.set(pId, cur);

      const batchRow: BatchRow = {
        batchNumber: bNum,
        netQty: net,
        lastCost: row.lastCost || 0,
        lastCreatedBy: row.lastCreatedBy ? row.lastCreatedBy.toString() : null,
        lastTaxMode: row.lastTaxMode,
        lastReferenceType: row.lastReferenceType,
        lastReferenceId: row.lastReferenceId,
      };
      productLastInflow.set(pId, batchRow);
      if (bNum) {
        if (!batchesByProduct.has(pId)) batchesByProduct.set(pId, []);
        batchesByProduct.get(pId)!.push(batchRow);
      }
    }
  }

  for (const prod of products) {
    if (prod.createdBy) userIds.add(prod.createdBy.toString());
  }
  const userMap = await buildUserMap(userIds);
  const taxInfoMap = await loadTaxInfoByReference(
    Array.from(productLastInflow.values()).map((b) => ({
      taxMode: b.lastTaxMode,
      referenceType: b.lastReferenceType,
      referenceId: b.lastReferenceId,
    }))
  );

  // 4. Build rows – items with batches get one row per batch,
  //    items without batches get a single row with product defaults
  const items: StockReportItem[] = [];

  for (const prod of products) {
    const pid = prod._id.toString();
    const prodBatches = batchesByProduct.get(pid) || [];
    const cat = prod.categoryId as any;
    const categoryName = cat && typeof cat === 'object' ? (cat.name ?? '') : '';
    const stock = stockMap.get(pid);
    const sellerUserId = stock?.lastCreatedBy ?? prod.createdBy?.toString() ?? null;

    const isVatApplicable = prod.vatCategory !== 'zero' && prod.vatCategory !== 'exempt' && (prod.vatPercent || 0) > 0;
    const vatPercent = isVatApplicable ? (prod.vatPercent || 0) : 0;

    if (prod.allowBatches !== false && prodBatches.length > 0) {
      // Product is batch-tracked and has batches
      let addedAny = false;
      for (const b of prodBatches) {
        if (b.netQty <= 0) continue;
        const metaKey = `${pid}_${b.batchNumber.toLowerCase()}`;
        const meta = batchMetaMap.get(metaKey);
        const cost = meta?.purchasePrice ?? (b.lastCost > 0 ? b.lastCost : (prod.purchasePrice ?? 0));
        const retail = meta?.retail ?? (prod.sellingPrice ?? prod.retailPrice ?? 0);
        const wholesale = meta?.wholesale ?? (prod.wholesalePrice ?? 0);
        const taxInfo = meta
          ? { taxMode: meta.taxMode, vatType: meta.vatType }
          : taxInfoFromTx(
              { taxMode: b.lastTaxMode, referenceType: b.lastReferenceType, referenceId: b.lastReferenceId },
              taxInfoMap
            );
        const { costRate, grossRate } = splitCostGross(cost, vatPercent, taxInfo);

        items.push({
          rowId: `${pid}-${b.batchNumber}`,
          productId: pid,
          imei: prod.imei ?? '',
          itemName: prod.name,
          batchNumber: b.batchNumber,
          itemGroup: prod.itemGroup ?? '',
          brand: prod.brand ?? '',
          category: categoryName,
          qtyAvailable: b.netQty,
          purchaseRate: cost,
          totalPurchaseRate: parseFloat((b.netQty * costRate).toFixed(2)),
          grossValue: parseFloat((b.netQty * grossRate).toFixed(2)),
          sellingPrice: retail,
          retailPrice: retail,
          wholesalePrice: wholesale,
          specialPrice1: prod.specialPrice ?? 0,
          specialPrice2: prod.specialPrice2 ?? 0,
          expiryDate: meta?.expiryDate || null,
          branch: 'MAIN BRANCH',
          sellerName: (b.lastCreatedBy ? userMap.get(b.lastCreatedBy) : null) ?? (sellerUserId ? userMap.get(sellerUserId) ?? 'N/A' : 'N/A'),
        });
        addedAny = true;
      }
      if (!addedAny) {
        // All batches 0 or depleted; show single row with 0 stock
        const pQty = stock?.qtyAvailable ?? 0;
        const lastIn = productLastInflow.get(pid);
        const pRate = lastIn?.lastCost || prod.purchasePrice || 0;
        const { costRate, grossRate } = splitCostGross(
          pRate,
          vatPercent,
          taxInfoFromTx(
            { taxMode: lastIn?.lastTaxMode, referenceType: lastIn?.lastReferenceType, referenceId: lastIn?.lastReferenceId },
            taxInfoMap
          )
        );
        items.push({
          rowId: pid,
          productId: pid,
          imei: prod.imei ?? '',
          itemName: prod.name,
          batchNumber: null,
          itemGroup: prod.itemGroup ?? '',
          brand: prod.brand ?? '',
          category: categoryName,
          qtyAvailable: pQty,
          purchaseRate: pRate,
          totalPurchaseRate: parseFloat((pQty * costRate).toFixed(2)),
          grossValue: parseFloat((pQty * grossRate).toFixed(2)),
          sellingPrice: prod.sellingPrice ?? prod.retailPrice ?? 0,
          retailPrice: prod.retailPrice ?? 0,
          wholesalePrice: prod.wholesalePrice ?? 0,
          specialPrice1: prod.specialPrice ?? 0,
          specialPrice2: prod.specialPrice2 ?? 0,
          expiryDate: null,
          branch: 'MAIN BRANCH',
          sellerName: sellerUserId ? userMap.get(sellerUserId) ?? 'N/A' : 'N/A',
        });
      }
    } else {
      // Non-batch product or no recorded batches
      const qtyAvailable = stock?.qtyAvailable ?? 0;
      const lastIn = productLastInflow.get(pid);
      const pRate = lastIn?.lastCost || prod.purchasePrice || 0;
      const { costRate, grossRate } = splitCostGross(
        pRate,
        vatPercent,
        taxInfoFromTx(
          { taxMode: lastIn?.lastTaxMode, referenceType: lastIn?.lastReferenceType, referenceId: lastIn?.lastReferenceId },
          taxInfoMap
        )
      );
      items.push({
        rowId: pid,
        productId: pid,
        imei: prod.imei ?? '',
        itemName: prod.name,
        batchNumber: null,
        itemGroup: prod.itemGroup ?? '',
        brand: prod.brand ?? '',
        category: categoryName,
        qtyAvailable,
        purchaseRate: pRate,
        totalPurchaseRate: parseFloat((qtyAvailable * costRate).toFixed(2)),
        grossValue: parseFloat((qtyAvailable * grossRate).toFixed(2)),
        sellingPrice: prod.sellingPrice ?? prod.retailPrice ?? 0,
        retailPrice: prod.retailPrice ?? 0,
        wholesalePrice: prod.wholesalePrice ?? 0,
        specialPrice1: prod.specialPrice ?? 0,
        specialPrice2: prod.specialPrice2 ?? 0,
        expiryDate: null,
        branch: 'MAIN BRANCH',
        sellerName: sellerUserId ? userMap.get(sellerUserId) ?? 'N/A' : 'N/A',
      });
    }
  }

  return { items, total };
}

// ──────────────────────────────────────────────────────────
// Last Purchase Rate Mode – one row per product, last purchase rate & date
// ──────────────────────────────────────────────────────────
async function getLastPurchaseRateReport(
  companyId: string,
  productFilter: Record<string, unknown>,
  opts: { page?: number; limit?: number; skipPagination?: boolean }
): Promise<{ items: StockReportItem[]; total: number }> {
  const companyOid = new mongoose.Types.ObjectId(companyId);

  // 1. Total stock per product (all transaction types)
  const stockAgg = await InventoryTransaction.aggregate([
    { $match: { companyId: companyOid } },
    {
      $group: {
        _id: '$productId',
        totalIn: { $sum: '$quantityIn' },
        totalOut: { $sum: '$quantityOut' },
        lastCreatedBy: { $last: '$createdBy' },
      },
    },
  ]);

  const stockMap = new Map<
    string,
    { qtyAvailable: number; lastCreatedBy: string | null }
  >();
  for (const item of stockAgg) {
    stockMap.set(item._id.toString(), {
      qtyAvailable: item.totalIn - item.totalOut,
      lastCreatedBy: item.lastCreatedBy?.toString() ?? null,
    });
  }

  // 2. Last purchase rate & date per product (most recent Purchase/Opening/Adjustment transaction)
  const lastPurchaseAgg = await InventoryTransaction.aggregate([
    {
      $match: {
        companyId: companyOid,
        type: { $in: ['Purchase', 'Opening', 'Adjustment'] },
        quantityIn: { $gt: 0 },
        costPrice: { $gt: 0 },
      },
    },
    { $sort: { date: -1, createdAt: -1 } },
    {
      $group: {
        _id: '$productId',
        lastPurchaseRate: { $first: '$costPrice' },
        lastPurchaseDate: { $first: '$date' },
        lastPurchaseQty: { $first: '$quantityIn' },
        lastSupplierId: { $first: '$createdBy' },
        lastBatchNumber: { $first: '$batchNumber' },
        lastNarration: { $first: '$narration' },
        lastTaxMode: { $first: '$taxMode' },
        lastReferenceType: { $first: '$referenceType' },
        lastReferenceId: { $first: '$referenceId' },
      },
    },
  ]);

  const lastPurchaseMap = new Map<
    string,
    {
      rate: number;
      date: Date | null;
      qty: number;
      supplierId: string | null;
      batchNumber: string | null;
      taxMode?: string;
      referenceType?: string;
      referenceId?: unknown;
    }
  >();
  for (const item of lastPurchaseAgg) {
    lastPurchaseMap.set(item._id.toString(), {
      rate: item.lastPurchaseRate ?? 0,
      date: item.lastPurchaseDate ?? null,
      qty: item.lastPurchaseQty ?? 0,
      supplierId: item.lastSupplierId?.toString() ?? null,
      batchNumber: item.lastBatchNumber || (item.lastNarration?.match(/Batch:\s*(\S+)/)?.[1]) || null,
      taxMode: item.lastTaxMode,
      referenceType: item.lastReferenceType,
      referenceId: item.lastReferenceId,
    });
  }
  const lastPurchaseTaxInfoMap = await loadTaxInfoByReference(
    lastPurchaseAgg.map((item) => ({
      taxMode: item.lastTaxMode,
      referenceType: item.lastReferenceType,
      referenceId: item.lastReferenceId,
    }))
  );

  // 3. Products
  const total = await Product.countDocuments(productFilter);
  let lpQuery = Product.find(productFilter)
    .populate('categoryId', 'name code')
    .sort({ name: 1 });

  if (!opts.skipPagination) {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);
    lpQuery = lpQuery.skip((page - 1) * limit).limit(limit);
  }

  const products = await lpQuery.lean();

  // 4. Users
  const userIds = new Set<string>();
  for (const prod of products) {
    const stock = stockMap.get(prod._id.toString());
    if (stock?.lastCreatedBy) userIds.add(stock.lastCreatedBy);
    const lp = lastPurchaseMap.get(prod._id.toString());
    if (lp?.supplierId) userIds.add(lp.supplierId);
    if (prod.createdBy) userIds.add(prod.createdBy.toString());
  }
  const userMap = await buildUserMap(userIds);

  // 5. Build response
  const items: StockReportItem[] = products.map((prod) => {
    const pid = prod._id.toString();
    const stock = stockMap.get(pid);
    const qtyAvailable = stock?.qtyAvailable ?? 0;
    const lp = lastPurchaseMap.get(pid);
    const purchaseRate = lp?.rate ?? prod.purchasePrice ?? 0;
    const sellerUserId = lp?.supplierId ?? stock?.lastCreatedBy ?? prod.createdBy?.toString() ?? null;

    const cat = prod.categoryId as any;
    const categoryName = cat && typeof cat === 'object' ? (cat.name ?? '') : '';

    const vatPercent = productVatPercent(prod);
    const { costRate, grossRate } = splitCostGross(
      purchaseRate,
      vatPercent,
      taxInfoFromTx(
        { taxMode: lp?.taxMode, referenceType: lp?.referenceType, referenceId: lp?.referenceId },
        lastPurchaseTaxInfoMap
      )
    );

    return {
      rowId: pid,
      productId: pid,
      imei: prod.imei ?? '',
      itemName: prod.name,
      batchNumber: lp?.batchNumber ?? null,
      itemGroup: prod.itemGroup ?? '',
      brand: prod.brand ?? '',
      category: categoryName,
      qtyAvailable,
      purchaseRate,
      totalPurchaseRate: parseFloat((qtyAvailable * costRate).toFixed(2)),
      grossValue: parseFloat((qtyAvailable * grossRate).toFixed(2)),
      sellingPrice: prod.sellingPrice ?? prod.retailPrice ?? 0,
      retailPrice: prod.retailPrice ?? 0,
      wholesalePrice: prod.wholesalePrice ?? 0,
      specialPrice1: prod.specialPrice ?? 0,
      specialPrice2: prod.specialPrice2 ?? 0,
      expiryDate: lp?.date ? new Date(lp.date).toISOString().split('T')[0] : null,
      branch: 'MAIN BRANCH',
      sellerName: sellerUserId ? userMap.get(sellerUserId) ?? 'N/A' : 'N/A',
    };
  });

  return { items, total };
}

// ──────────────────────────────────────────────────────────
// Shared: build user display-name map
// ──────────────────────────────────────────────────────────
async function buildUserMap(userIds: Set<string>): Promise<Map<string, string>> {
  if (userIds.size === 0) return new Map();

  const users = await User.find({
    _id: { $in: Array.from(userIds).map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select('username fullName displayName')
    .lean();

  const map = new Map<string, string>();
  for (const u of users) {
    map.set(
      u._id.toString(),
      (u as any).fullName || (u as any).displayName || u.username || 'Unknown'
    );
  }
  return map;
}

// ─── Get current stock for a single product ────────────────
export async function getProductStock(
  companyId: string,
  productId: string
): Promise<number> {
  const companyOid = new mongoose.Types.ObjectId(companyId);
  const productOid = new mongoose.Types.ObjectId(productId);

  const agg = await InventoryTransaction.aggregate([
    { $match: { companyId: companyOid, productId: productOid } },
    {
      $group: {
        _id: null,
        totalIn: { $sum: '$quantityIn' },
        totalOut: { $sum: '$quantityOut' },
      },
    },
  ]);

  if (agg.length === 0) return 0;
  return agg[0].totalIn - agg[0].totalOut;
}

export interface StockMovementItem {
  id: string;
  sl?: number;
  productId: string;
  itemCode: string;
  itemName: string;
  category: string;
  brand: string;
  opening: number;
  purchase: number;
  returnQty: number; // Return
  stockAdjPlus: number; // SA+ (Stock Adj +)
  stockAdjMinus: number; // SA- (Stock Adj -)
  damage: number; // Damage & Wastage
  qty: number; // Closing Qty
  purchaseRate: number;
  stockValue: number; // Cost Value
  grossValue: number; // Gross Value (without VAT)
}

export async function getStockMovement(
  companyId: string,
  opts: {
    financialYearId?: string;
    productId?: string;
    fromDate?: string;
    toDate?: string;
    type?: string;
    category?: string;
    brand?: string;
    search?: string;
  }
): Promise<{
  items: StockMovementItem[];
  summary: {
    totalOpening: number;
    totalPurchase: number;
    totalReturn: number;
    totalStockAdjPlus: number;
    totalStockAdjMinus: number;
    totalDamage: number;
    totalQty: number;
    totalStockValue: number;
    totalGrossValue: number;
    count: number;
  };
}> {
  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    return {
      items: [],
      summary: {
        totalOpening: 0,
        totalPurchase: 0,
        totalReturn: 0,
        totalStockAdjPlus: 0,
        totalStockAdjMinus: 0,
        totalDamage: 0,
        totalQty: 0,
        totalStockValue: 0,
        totalGrossValue: 0,
        count: 0,
      },
    };
  }

  const companyOid = new mongoose.Types.ObjectId(companyId);

  // 1. Fetch matching products
  const productFilter: any = { companyId: companyOid };
  if (opts.productId && opts.productId !== 'undefined' && opts.productId !== 'null' && opts.productId.trim()) {
    if (mongoose.Types.ObjectId.isValid(opts.productId)) {
      productFilter._id = new mongoose.Types.ObjectId(opts.productId);
    }
  }
  if (opts.brand && opts.brand !== 'All') {
    productFilter.brand = opts.brand;
  }

  const products = await Product.find(productFilter)
    .populate('categoryId', 'name code')
    .sort({ name: 1 })
    .lean();

  const fromDate = opts.fromDate && !isNaN(new Date(opts.fromDate).getTime()) ? new Date(opts.fromDate) : null;
  const toDate = opts.toDate && !isNaN(new Date(opts.toDate).getTime()) ? new Date(new Date(opts.toDate).setHours(23, 59, 59, 999)) : null;

  // 2. Fetch all inventory transactions for these products
  const txMatch: any = { companyId: companyOid };
  if (opts.productId && opts.productId !== 'undefined' && opts.productId !== 'null' && opts.productId.trim()) {
    if (mongoose.Types.ObjectId.isValid(opts.productId)) {
      txMatch.productId = new mongoose.Types.ObjectId(opts.productId);
    }
  }

  const allTx = await InventoryTransaction.find(txMatch).sort({ date: 1, createdAt: 1 }).lean();
  const taxInfoMap = await loadTaxInfoByReference(allTx);

  // Group transactions per product
  const txByProduct = new Map<string, any[]>();
  for (const t of allTx) {
    const pId = t.productId ? t.productId.toString() : '';
    if (!pId) continue;
    if (!txByProduct.has(pId)) txByProduct.set(pId, []);
    txByProduct.get(pId)!.push(t);
  }

  let items: StockMovementItem[] = products.map((prod, index) => {
    const pid = prod._id ? prod._id.toString() : '';
    const pTx = txByProduct.get(pid) || [];
    let categoryName = '';
    if (prod.categoryId) {
      if (typeof prod.categoryId === 'object' && prod.categoryId !== null && 'name' in prod.categoryId) {
        categoryName = (prod.categoryId as any).name || '';
      } else if (typeof prod.categoryId === 'string') {
        categoryName = prod.categoryId;
      }
    }
    if (!categoryName) {
      categoryName = (prod as any).categoryName || (prod as any).category || '';
    }

    let opening = 0;
    let purchase = 0;
    let returnQty = 0;
    let stockAdjPlus = 0;
    let stockAdjMinus = 0;
    let damage = 0;
    let sales = 0;

    for (const t of pTx) {
      const tDate = t.date ? new Date(t.date) : (t.createdAt ? new Date(t.createdAt) : new Date());
      const isBeforeFrom = fromDate ? tDate < fromDate : false;
      const isAfterTo = toDate ? tDate > toDate : false;

      const qIn = t.quantityIn || 0;
      const qOut = t.quantityOut || 0;

      if (isBeforeFrom) {
        // Transactions prior to From Date contribute to Opening
        opening += qIn - qOut;
      } else if (!isAfterTo) {
        // Transactions within the date range
        switch (t.type) {
          case 'Opening':
            opening += qIn - qOut;
            break;
          case 'Purchase':
            purchase += qIn;
            break;
          case 'SalesReturn':
            returnQty += qIn;
            break;
          case 'PurchaseReturn':
            returnQty += qOut;
            break;
          case 'Adjustment':
            if (qIn > 0) stockAdjPlus += qIn;
            if (qOut > 0) stockAdjMinus += qOut;
            break;
          case 'Damage':
          case 'Wastage':
            damage += qOut;
            break;
          case 'Sales':
            sales += qOut;
            break;
          default:
            if (qIn > 0) purchase += qIn;
            if (qOut > 0) sales += qOut;
            break;
        }
      }
    }

    // Net closing qty
    const qty = opening + purchase + returnQty + stockAdjPlus - stockAdjMinus - damage - sales;

    // Calculate FIFO Average Purchase Rate for remaining stock
    const inflowTxns = (pTx || [])
      .filter((t: any) => ['Purchase', 'Opening', 'Adjustment'].includes(t.type) && (t.quantityIn || 0) > 0 && (t.costPrice || 0) > 0)
      .sort((a: any, b: any) => new Date(a.date || a.createdAt).getTime() - new Date(b.date || b.createdAt).getTime());

    const vatPercent = productVatPercent(prod);
    let avgStoredRate = prod.purchasePrice || 0;
    let avgCostRate = avgStoredRate;
    let avgGrossRate = avgStoredRate;
    if (qty > 0 && inflowTxns.length > 0) {
      const totalInflow = inflowTxns.reduce((s: number, t: any) => s + (t.quantityIn || 0), 0);
      let soldRemaining = Math.max(totalInflow - qty, 0);
      let storedValuation = 0;
      let costValuation = 0;
      let grossValuation = 0;
      let remainingQty = 0;
      for (const t of inflowTxns) {
        const soldFromBatch = Math.min(t.quantityIn || 0, soldRemaining);
        const rem = (t.quantityIn || 0) - soldFromBatch;
        soldRemaining -= soldFromBatch;
        if (rem > 0 && (t.costPrice || 0) > 0) {
          const { costRate, grossRate } = splitCostGross(t.costPrice, vatPercent, taxInfoFromTx(t, taxInfoMap));
          storedValuation += rem * t.costPrice;
          costValuation += rem * costRate;
          grossValuation += rem * grossRate;
          remainingQty += rem;
        }
      }
      if (remainingQty > 0) {
        avgStoredRate = parseFloat((storedValuation / remainingQty).toFixed(4));
        avgCostRate = parseFloat((costValuation / remainingQty).toFixed(4));
        avgGrossRate = parseFloat((grossValuation / remainingQty).toFixed(4));
      } else {
        const fallback = splitCostGross(avgStoredRate, vatPercent, { taxMode: 'inclusive', vatType: 'Vat' });
        avgCostRate = fallback.costRate;
        avgGrossRate = fallback.grossRate;
      }
    } else {
      const fallback = splitCostGross(avgStoredRate, vatPercent, { taxMode: 'inclusive', vatType: 'Vat' });
      avgCostRate = fallback.costRate;
      avgGrossRate = fallback.grossRate;
    }
    const purchaseRate = avgStoredRate;
    const stockValue = parseFloat((qty * avgCostRate).toFixed(2));
    const grossValue = parseFloat((qty * avgGrossRate).toFixed(2));

    return {
      id: pid,
      sl: index + 1,
      productId: pid,
      itemCode: String(prod.code || prod.imei || ''),
      itemName: String(prod.name || ''),
      category: String(categoryName || ''),
      brand: String(prod.brand || ''),
      opening,
      purchase,
      returnQty,
      stockAdjPlus,
      stockAdjMinus,
      damage,
      qty,
      purchaseRate,
      stockValue,
      grossValue,
    };
  });

  // Filter category if specified
  if (opts.category && opts.category !== 'All') {
    const catLower = opts.category.trim().toLowerCase();
    items = items.filter((i) => (i.category || '').toLowerCase() === catLower);
  }

  // Filter search
  if (opts.search) {
    const sLower = opts.search.trim().toLowerCase();
    items = items.filter(
      (i) =>
        (i.itemName || '').toLowerCase().includes(sLower) ||
        (i.itemCode || '').toLowerCase().includes(sLower) ||
        (i.category || '').toLowerCase().includes(sLower) ||
        (i.brand || '').toLowerCase().includes(sLower)
    );
  }

  // Assign consecutive SL numbers
  items.forEach((item, idx) => {
    item.sl = idx + 1;
  });

  const totalOpening = items.reduce((s, i) => s + i.opening, 0);
  const totalPurchase = items.reduce((s, i) => s + i.purchase, 0);
  const totalReturn = items.reduce((s, i) => s + i.returnQty, 0);
  const totalStockAdjPlus = items.reduce((s, i) => s + i.stockAdjPlus, 0);
  const totalStockAdjMinus = items.reduce((s, i) => s + i.stockAdjMinus, 0);
  const totalDamage = items.reduce((s, i) => s + i.damage, 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalStockValue = items.reduce((s, i) => s + i.stockValue, 0);
  const totalGrossValue = items.reduce((s, i) => s + i.grossValue, 0);

  return {
    items,
    summary: {
      totalOpening,
      totalPurchase,
      totalReturn,
      totalStockAdjPlus,
      totalStockAdjMinus,
      totalDamage,
      totalQty,
      totalStockValue,
      totalGrossValue,
      count: items.length,
    },
  };
}

export interface ProductTransactionDetail {
  id: string;
  date: string;
  type: string;
  voucherName: string;
  voucherNo: string;
  referenceType: string;
  referenceId: string;
  invoiceType?: string;
  batchNumber?: string;
  quantityIn: number;
  quantityOut: number;
  rate: number;
  amount: number;
  runningBalance: number;
  partyName?: string;
  partyId?: string;
  partyType?: 'Customer' | 'Supplier' | 'Other';
  narration?: string;
}

function extractDocNo(narration?: string): string | null {
  if (!narration) return null;
  const match = narration.match(/\b([A-Z0-9]{2,8}-\d+)\b/i);
  return match ? match[1] : null;
}

export async function getProductTransactions(
  companyId: string,
  productId: string,
  opts: {
    fromDate?: string;
    toDate?: string;
    type?: string;
    financialYearId?: string;
  } = {}
): Promise<{
  product: {
    id: string;
    name: string;
    sku: string;
    code?: string;
    barcode?: string;
    unit?: string;
    sellingPrice: number;
    purchasePrice: number;
    currentStock: number;
  };
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  closingBalance: number;
  totalValueIn: number;
  totalValueOut: number;
  transactions: ProductTransactionDetail[];
}> {
  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    throw new Error('Invalid Company ID');
  }
  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    throw new Error('Invalid Product ID');
  }

  const companyOid = new mongoose.Types.ObjectId(companyId);
  const productOid = new mongoose.Types.ObjectId(productId);

  // 1. Fetch product
  const prodDoc = await Product.findOne({ _id: productOid, companyId: companyOid })
    .populate('unitOfMeasureId', 'name shortCode')
    .lean();

  if (!prodDoc) {
    throw new Error('Product not found');
  }

  const unitObj = prodDoc.unitOfMeasureId as any;
  const unitDisplay = unitObj && typeof unitObj === 'object' ? (unitObj.shortCode || unitObj.name || '') : '';
  const currentStock = await getProductStock(companyId, productId);

  // 2. Parse Dates
  const fromDate = opts.fromDate && !isNaN(new Date(opts.fromDate).getTime())
    ? new Date(new Date(opts.fromDate).setHours(0, 0, 0, 0))
    : null;
  const toDate = opts.toDate && !isNaN(new Date(opts.toDate).getTime())
    ? new Date(new Date(opts.toDate).setHours(23, 59, 59, 999))
    : null;

  // 3. Opening balance calculation (transactions prior to fromDate)
  let openingBalance = 0;
  if (fromDate) {
    const priorAgg = await InventoryTransaction.aggregate([
      {
        $match: {
          companyId: companyOid,
          productId: productOid,
          date: { $lt: fromDate },
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
    if (priorAgg.length > 0) {
      openingBalance = priorAgg[0].totalIn - priorAgg[0].totalOut;
    }
  }

  // 4. Query range transactions
  const txMatch: any = { companyId: companyOid, productId: productOid };
  if (fromDate && toDate) {
    txMatch.date = { $gte: fromDate, $lte: toDate };
  } else if (fromDate) {
    txMatch.date = { $gte: fromDate };
  } else if (toDate) {
    txMatch.date = { $lte: toDate };
  }

  if (opts.type && opts.type !== 'All') {
    txMatch.type = opts.type;
  }

  const txns = await InventoryTransaction.find(txMatch)
    .sort({ date: 1, createdAt: 1, _id: 1 })
    .lean();

  // 5. Group and resolve reference IDs
  const purchaseIds: mongoose.Types.ObjectId[] = [];
  const salesIds: mongoose.Types.ObjectId[] = [];
  const purchaseReturnIds: mongoose.Types.ObjectId[] = [];
  const stockAdjIds: mongoose.Types.ObjectId[] = [];
  const openingIds: mongoose.Types.ObjectId[] = [];
  const voucherIds: mongoose.Types.ObjectId[] = [];

  for (const t of txns) {
    if (!t.referenceId) continue;
    const refOid = t.referenceId instanceof mongoose.Types.ObjectId
      ? t.referenceId
      : new mongoose.Types.ObjectId(String(t.referenceId));

    const refType = (t.referenceType || '').toLowerCase();
    const tType = (t.type || '').toLowerCase();

    if (refType === 'purchase' || refType === 'purchaseinvoice' || tType === 'purchase') {
      purchaseIds.push(refOid);
    } else if (refType === 'salesinvoice' || tType === 'sales' || tType === 'salesreturn') {
      salesIds.push(refOid);
    } else if (refType === 'purchasereturn' || tType === 'purchasereturn') {
      purchaseReturnIds.push(refOid);
    } else if (refType === 'stockadjustment' || refType === 'damagewastage' || tType === 'adjustment' || tType === 'damage' || tType === 'wastage') {
      stockAdjIds.push(refOid);
    } else if (refType === 'openingstockentry' || tType === 'opening') {
      openingIds.push(refOid);
    } else if (refType === 'voucher') {
      voucherIds.push(refOid);
    }
  }

  // Query metadata maps in parallel
  const [
    purchaseDocs,
    salesDocs,
    purchaseReturnDocs,
    stockAdjDocs,
    openingDocs,
    voucherDocs,
  ] = await Promise.all([
    purchaseIds.length > 0
      ? PurchaseInvoice.find({ _id: { $in: purchaseIds } }, 'invoiceNo supplierInvoiceNo supplierId supplierName date totalAmount').lean()
      : [],
    salesIds.length > 0
      ? SalesInvoice.find({ _id: { $in: salesIds } }, 'invoiceNo type customerId customerName date totalAmount').lean()
      : [],
    purchaseReturnIds.length > 0
      ? PurchaseReturn.find({ _id: { $in: purchaseReturnIds } }, 'invoiceNo supplierId supplierName date totalAmount').lean()
      : [],
    stockAdjIds.length > 0
      ? StockAdjustment.find({ _id: { $in: stockAdjIds } }, 'adjustmentNo entryType reason date totalLossValue totalGainValue').lean()
      : [],
    openingIds.length > 0
      ? OpeningPurchaseEntry.find({ _id: { $in: openingIds } }, 'entryNo date totalAmount').lean()
      : [],
    voucherIds.length > 0
      ? Voucher.find({ _id: { $in: voucherIds } }, 'voucherNo voucherType date narration').lean()
      : [],
  ]);

  const purchaseMap = new Map<string, any>(purchaseDocs.map((d: any) => [d._id.toString(), d]));
  const salesMap = new Map<string, any>(salesDocs.map((d: any) => [d._id.toString(), d]));
  const purchaseReturnMap = new Map<string, any>(purchaseReturnDocs.map((d: any) => [d._id.toString(), d]));
  const stockAdjMap = new Map<string, any>(stockAdjDocs.map((d: any) => [d._id.toString(), d]));
  const openingMap = new Map<string, any>(openingDocs.map((d: any) => [d._id.toString(), d]));
  const voucherMap = new Map<string, any>(voucherDocs.map((d: any) => [d._id.toString(), d]));

  // 6. Build transaction details & running balance
  let currentBalance = openingBalance;
  let totalIn = 0;
  let totalOut = 0;
  let totalValueIn = 0;
  let totalValueOut = 0;

  const transactions: ProductTransactionDetail[] = txns.map((t) => {
    const qtyIn = t.quantityIn || 0;
    const qtyOut = t.quantityOut || 0;
    currentBalance = currentBalance + qtyIn - qtyOut;
    totalIn += qtyIn;
    totalOut += qtyOut;

    const rate = t.costPrice || 0;
    const lineQty = qtyIn > 0 ? qtyIn : qtyOut;
    const amount = parseFloat((rate * lineQty).toFixed(2));
    if (qtyIn > 0) totalValueIn += amount;
    if (qtyOut > 0) totalValueOut += amount;

    const refIdStr = t.referenceId ? t.referenceId.toString() : '';
    let voucherName: string = t.type;
    let voucherNo = '';
    let partyName = '';
    let partyId = '';
    let partyType: 'Customer' | 'Supplier' | 'Other' = 'Other';
    let invoiceType: string | undefined = undefined;

    switch (t.type) {
      case 'Purchase': {
        const ref = purchaseMap.get(refIdStr);
        voucherName = 'Purchase Invoice';
        voucherNo = ref?.invoiceNo || ref?.supplierInvoiceNo || extractDocNo(t.narration) || 'PUR';
        partyName = ref?.supplierName || '';
        partyId = ref?.supplierId ? ref.supplierId.toString() : '';
        partyType = 'Supplier';
        break;
      }
      case 'Sales': {
        const ref = salesMap.get(refIdStr);
        voucherName = ref?.type === 'POS' ? 'POS Sales' : ref?.type === 'B2B' ? 'B2B Sales' : 'Sales Invoice';
        voucherNo = ref?.invoiceNo || extractDocNo(t.narration) || 'INV';
        partyName = ref?.customerName || '';
        partyId = ref?.customerId ? ref.customerId.toString() : '';
        partyType = 'Customer';
        invoiceType = ref?.type || 'B2C';
        break;
      }
      case 'SalesReturn': {
        const ref = salesMap.get(refIdStr);
        voucherName = 'Sales Return';
        voucherNo = ref?.invoiceNo || extractDocNo(t.narration) || 'SR';
        partyName = ref?.customerName || '';
        partyId = ref?.customerId ? ref.customerId.toString() : '';
        partyType = 'Customer';
        invoiceType = 'Return';
        break;
      }
      case 'PurchaseReturn': {
        const ref = purchaseReturnMap.get(refIdStr);
        voucherName = 'Purchase Return';
        voucherNo = ref?.invoiceNo || extractDocNo(t.narration) || 'PR';
        partyName = ref?.supplierName || '';
        partyId = ref?.supplierId ? ref.supplierId.toString() : '';
        partyType = 'Supplier';
        break;
      }
      case 'Adjustment': {
        const ref = stockAdjMap.get(refIdStr);
        const isDmg = ref?.entryType === 'DAMAGE' || (ref?.reason && /damage|wastage|expired/i.test(ref.reason));
        voucherName = isDmg ? 'Damage / Wastage' : 'Stock Adjustment';
        voucherNo = ref?.adjustmentNo || extractDocNo(t.narration) || 'ADJ';
        partyName = ref?.reason || '';
        invoiceType = isDmg ? 'DAMAGE' : 'ADJUSTMENT';
        break;
      }
      case 'Damage':
      case 'Wastage': {
        const ref = stockAdjMap.get(refIdStr);
        voucherName = 'Damage / Wastage';
        voucherNo = ref?.adjustmentNo || extractDocNo(t.narration) || 'DMG';
        partyName = ref?.reason || '';
        invoiceType = 'DAMAGE';
        break;
      }
      case 'Opening': {
        const ref = openingMap.get(refIdStr);
        voucherName = 'Opening Purchase';
        voucherNo = ref?.entryNo || extractDocNo(t.narration) || 'OP';
        break;
      }
      default: {
        if (voucherMap.has(refIdStr)) {
          const v = voucherMap.get(refIdStr);
          voucherName = v?.voucherType ? `${v.voucherType} Voucher` : 'Voucher';
          voucherNo = v?.voucherNo || extractDocNo(t.narration) || 'VCH';
        } else {
          voucherName = t.type || 'Transaction';
          voucherNo = extractDocNo(t.narration) || refIdStr || '-';
        }
        break;
      }
    }

    return {
      id: t._id.toString(),
      date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
      type: t.type,
      voucherName,
      voucherNo: voucherNo || '-',
      referenceType: t.referenceType || t.type,
      referenceId: refIdStr,
      invoiceType,
      batchNumber: t.batchNumber || '',
      quantityIn: qtyIn,
      quantityOut: qtyOut,
      rate,
      amount,
      runningBalance: parseFloat(currentBalance.toFixed(2)),
      partyName,
      partyId,
      partyType,
      narration: t.narration || '',
    };
  });

  return {
    product: {
      id: prodDoc._id.toString(),
      name: prodDoc.name,
      sku: prodDoc.sku || '',
      code: prodDoc.code || '',
      barcode: prodDoc.imei || prodDoc.systemBarcode || prodDoc.internationalBarcode || '',
      unit: unitDisplay,
      sellingPrice: prodDoc.sellingPrice ?? prodDoc.retailPrice ?? 0,
      purchasePrice: prodDoc.purchasePrice ?? 0,
      currentStock,
    },
    openingBalance: parseFloat(openingBalance.toFixed(2)),
    totalIn: parseFloat(totalIn.toFixed(2)),
    totalOut: parseFloat(totalOut.toFixed(2)),
    closingBalance: parseFloat(currentBalance.toFixed(2)),
    totalValueIn: parseFloat(totalValueIn.toFixed(2)),
    totalValueOut: parseFloat(totalValueOut.toFixed(2)),
    transactions,
  };
}

/**
 * Calculates the total valuation of live on-hand stock for a company as of an optional date.
 * Default method is 'fifo' (GAAP/IFRS standard for inventory balance sheet valuation),
 * with fallback support for 'lastPurchase'.
 */
export async function getLiveStockValuation(
  companyId: string,
  asAtDate?: Date,
  method: 'fifo' | 'lastPurchase' = 'fifo',
  withoutVat: boolean = false
): Promise<number> {
  const companyOid = new mongoose.Types.ObjectId(companyId);
  const dateFilter: Record<string, unknown> = {};
  if (asAtDate) {
    const end = new Date(asAtDate);
    end.setHours(23, 59, 59, 999);
    dateFilter.date = { $lte: end };
  }

  // 1. Total stock per product
  const stockAgg = await InventoryTransaction.aggregate([
    { $match: { companyId: companyOid, ...dateFilter } },
    {
      $group: {
        _id: '$productId',
        totalIn: { $sum: '$quantityIn' },
        totalOut: { $sum: '$quantityOut' },
      },
    },
  ]);

  const stockMap = new Map<string, number>();
  for (const item of stockAgg) {
    const net = (item.totalIn || 0) - (item.totalOut || 0);
    // Include negative (oversold) qty so P&L/balance-sheet closing stock
    // is reduced by the cost of those units, matching stock reports.
    if (Math.abs(net) > 1e-9) {
      stockMap.set(item._id.toString(), net);
    }
  }

  if (stockMap.size === 0) return 0;

  // 2. Fetch purchase/opening/adjustment transactions
  const purchaseTxns = await InventoryTransaction.find({
    companyId: companyOid,
    type: { $in: ['Purchase', 'Opening', 'Adjustment'] },
    quantityIn: { $gt: 0 },
    costPrice: { $gt: 0 },
    ...dateFilter,
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const purchaseByProduct = new Map<string, typeof purchaseTxns>();
  for (const tx of purchaseTxns) {
    const pid = tx.productId.toString();
    if (!purchaseByProduct.has(pid)) purchaseByProduct.set(pid, []);
    purchaseByProduct.get(pid)!.push(tx);
  }

  // Fallback to product purchasePrice and VAT info
  const productIds = Array.from(stockMap.keys()).map((id) => new mongoose.Types.ObjectId(id));
  const products = await Product.find({ _id: { $in: productIds } }).select('_id purchasePrice vatPercent vatCategory').lean();
  const prodCostMap = new Map<string, number>(products.map((p) => [p._id.toString(), p.purchasePrice ?? 0]));
  const prodVatMap = new Map<string, number>(products.map((p) => {
    const isVatApplicable = p.vatCategory !== 'zero' && p.vatCategory !== 'exempt' && (p.vatPercent || 0) > 0;
    return [p._id.toString(), isVatApplicable ? (p.vatPercent || 0) : 0];
  }));

  const taxInfoMap = await loadTaxInfoByReference(purchaseTxns);
  const pickRate = (pid: string, rawRate: number, taxInfo?: PurchaseTaxInfo | null) => {
    const rates = splitCostGross(rawRate, prodVatMap.get(pid) || 0, taxInfo);
    return withoutVat ? rates.grossRate : rates.costRate;
  };

  let totalValuation = 0;

  if (method === 'lastPurchase') {
    for (const [pid, netStock] of stockMap.entries()) {
      const batches = purchaseByProduct.get(pid) || [];
      const lastTx = batches.length > 0 ? batches[batches.length - 1] : null;
      const rawLastRate = lastTx?.costPrice ?? prodCostMap.get(pid) ?? 0;
      const lastRate = pickRate(pid, rawLastRate, lastTx ? taxInfoFromTx(lastTx, taxInfoMap) : { taxMode: 'inclusive', vatType: 'Vat' });
      totalValuation += netStock * lastRate;
    }
  } else {
    // FIFO valuation
    for (const [pid, netStock] of stockMap.entries()) {
      const batches = purchaseByProduct.get(pid) || [];

      if (netStock < 0) {
        const lastTx = batches.length > 0 ? batches[batches.length - 1] : null;
        const rawFallback = prodCostMap.get(pid) ?? (lastTx?.costPrice ?? 0);
        const fallbackPrice = pickRate(
          pid,
          rawFallback,
          lastTx ? taxInfoFromTx(lastTx, taxInfoMap) : { taxMode: 'inclusive', vatType: 'Vat' }
        );
        totalValuation += netStock * fallbackPrice;
        continue;
      }

      const totalPurchased = batches.reduce((sum, tx) => sum + (tx.quantityIn || 0), 0);
      const totalSold = totalPurchased - netStock;

      let soldRemaining = Math.max(totalSold, 0);
      let lineValuation = 0;
      let totalRemainingQty = 0;

      for (const tx of batches) {
        const soldFromBatch = Math.min(tx.quantityIn || 0, soldRemaining);
        const remainingInBatch = (tx.quantityIn || 0) - soldFromBatch;
        soldRemaining -= soldFromBatch;

        if (remainingInBatch > 0 && (tx.costPrice ?? 0) > 0) {
          const effCost = pickRate(pid, tx.costPrice, taxInfoFromTx(tx, taxInfoMap));
          lineValuation += remainingInBatch * effCost;
          totalRemainingQty += remainingInBatch;
        }
      }

      if (totalRemainingQty > 0) {
        totalValuation += lineValuation;
      } else {
        const lastTx = batches.length > 0 ? batches[batches.length - 1] : null;
        const rawFallback = prodCostMap.get(pid) ?? (lastTx?.costPrice ?? 0);
        const fallbackPrice = pickRate(
          pid,
          rawFallback,
          lastTx ? taxInfoFromTx(lastTx, taxInfoMap) : { taxMode: 'inclusive', vatType: 'Vat' }
        );
        totalValuation += netStock * fallbackPrice;
      }
    }
  }

  return parseFloat(totalValuation.toFixed(2));
}


