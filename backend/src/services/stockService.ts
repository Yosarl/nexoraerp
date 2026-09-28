import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { User } from '../models/User';

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
  'qtyAvailable', 'purchaseRate', 'totalPurchaseRate', 'sellingPrice',
  'retailPrice', 'wholesalePrice', 'specialPrice1', 'specialPrice2',
];

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

  // 2. Average cost price from Purchase/Opening batches that still have stock (FIFO)
  const purchaseTxns = await InventoryTransaction.find({
    companyId: companyOid,
    type: { $in: ['Purchase', 'Opening'] },
    quantityIn: { $gt: 0 },
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

  // For each product, use FIFO to find which batches still have stock,
  // then average only those batches' cost prices
  const avgCostMap = new Map<string, number>();
  for (const [pid, batches] of purchaseByProduct) {
    const stock = stockMap.get(pid);
    const netStock = stock?.qtyAvailable ?? 0;
    const totalPurchased = batches.reduce((sum, tx) => sum + tx.quantityIn, 0);
    const totalSold = totalPurchased - netStock;

    let soldRemaining = Math.max(totalSold, 0);
    let costSum = 0;
    let costCount = 0;

    for (const tx of batches) {
      const soldFromBatch = Math.min(tx.quantityIn, soldRemaining);
      const remainingInBatch = tx.quantityIn - soldFromBatch;
      soldRemaining -= soldFromBatch;

      if (remainingInBatch > 0 && (tx.costPrice ?? 0) > 0) {
        costSum += tx.costPrice;
        costCount++;
      }
    }

    if (costCount > 0) {
      avgCostMap.set(pid, costSum / costCount);
    } else if (batches.length > 0) {
      // Fallback: use last batch cost if all sold out
      avgCostMap.set(pid, batches[batches.length - 1].costPrice ?? 0);
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
    const purchaseRate = avgCostMap.get(pid) ?? prod.purchasePrice ?? 0;
    const sellerUserId = stock?.lastCreatedBy ?? prod.createdBy?.toString() ?? null;

    const cat = prod.categoryId as any;
    const categoryName = cat && typeof cat === 'object' ? (cat.name ?? '') : '';

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
      totalPurchaseRate: qtyAvailable * purchaseRate,
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

  // 2. Get all Purchase/Opening transactions for these products
  const transactions = await InventoryTransaction.find({
    companyId: companyOid,
    productId: { $in: productIds },
    type: { $in: ['Purchase', 'Opening'] },
    quantityIn: { $gt: 0 },
  })
    .sort({ date: -1, createdAt: -1 })
    .lean();

  // Group transactions by product ID
  const txByProduct = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    const pid = tx.productId.toString();
    if (!txByProduct.has(pid)) {
      txByProduct.set(pid, []);
    }
    txByProduct.get(pid)!.push(tx);
  }

  // 3. Get total stock per product (all transaction types, for products without batches)
  const stockAgg = await InventoryTransaction.aggregate([
    { $match: { companyId: companyOid, productId: { $in: productIds } } },
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

  // 4. Users
  const userIds = new Set<string>();
  for (const tx of transactions) {
    if (tx.createdBy) userIds.add(tx.createdBy.toString());
  }
  for (const prod of products) {
    if (prod.createdBy) userIds.add(prod.createdBy.toString());
  }
  const userMap = await buildUserMap(userIds);

  // 5. Build rows – items with batches get one row per batch,
  //    items without batches get a single row with product defaults
  const items: StockReportItem[] = [];

  for (const prod of products) {
    const pid = prod._id.toString();
    const batches = txByProduct.get(pid);
    const cat = prod.categoryId as any;
    const categoryName = cat && typeof cat === 'object' ? (cat.name ?? '') : '';

    if (batches && batches.length > 0) {
      // If allowBatches is disabled, show single row with average purchase rate
      if (prod.allowBatches === false) {
        const nonZeroBatches = batches.filter((tx) => tx.quantityIn > 0 && (tx.costPrice ?? 0) > 0);
        const avgCost = nonZeroBatches.length > 0
          ? nonZeroBatches.reduce((sum, tx) => sum + (tx.costPrice ?? 0), 0) / nonZeroBatches.length
          : batches[0].costPrice ?? 0;
        const stock = stockMap.get(pid);
        const qtyAvailable = stock?.qtyAvailable ?? 0;
        const sellerUserId = stock?.lastCreatedBy ?? prod.createdBy?.toString() ?? null;
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
          purchaseRate: avgCost,
          totalPurchaseRate: qtyAvailable * avgCost,
          sellingPrice: prod.sellingPrice ?? prod.retailPrice ?? 0,
          retailPrice: prod.retailPrice ?? 0,
          wholesalePrice: prod.wholesalePrice ?? 0,
          specialPrice1: prod.specialPrice ?? 0,
          specialPrice2: prod.specialPrice2 ?? 0,
          expiryDate: null,
          branch: 'MAIN BRANCH',
          sellerName: sellerUserId ? userMap.get(sellerUserId) ?? 'N/A' : 'N/A',
        });
      } else {
        // Product has batch(es) – one row per batch
        // Distribute net stock across batches using FIFO (oldest batch consumed first)
        const stock = stockMap.get(pid);
        const netStock = stock?.qtyAvailable ?? 0;
        const totalPurchased = batches.reduce((sum, tx) => sum + tx.quantityIn, 0);
        const totalSold = totalPurchased - netStock;

        // Sort batches oldest-first for FIFO distribution
        const sortedBatches = [...batches].sort((a, b) => {
          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          if (dateA !== dateB) return dateA - dateB;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

        let soldRemaining = Math.max(totalSold, 0);
        const batchRows: typeof items = [];
        for (const tx of sortedBatches) {
          // Subtract sold qty from this batch (FIFO)
          const soldFromBatch = Math.min(tx.quantityIn, soldRemaining);
          const batchQty = tx.quantityIn - soldFromBatch;
          soldRemaining -= soldFromBatch;

          // Skip batches with 0 stock
          if (batchQty <= 0) continue;

          const sellerUserId = tx.createdBy?.toString() ?? null;
          batchRows.push({
            rowId: tx._id.toString(),
            productId: pid,
            imei: prod.imei ?? '',
            itemName: prod.name,
            batchNumber: tx.batchNumber || (tx.narration?.match(/Batch:\s*(\S+)/)?.[1]) || null,
            itemGroup: prod.itemGroup ?? '',
            brand: prod.brand ?? '',
            category: categoryName,
            qtyAvailable: batchQty,
            purchaseRate: tx.costPrice ?? 0,
            totalPurchaseRate: batchQty * (tx.costPrice ?? 0),
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

        // Handle excess stock from sales returns (netStock > totalPurchased)
        // Add returned stock to the specific batch it was returned to
        if (totalSold < 0 && Math.abs(totalSold) > 0) {
          const excessStock = Math.abs(totalSold);

          // Query SalesReturn transactions for this product grouped by batchNumber
          const returnAgg = await InventoryTransaction.aggregate([
            {
              $match: {
                companyId: companyOid,
                productId: new mongoose.Types.ObjectId(pid),
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

          // Find the batch narration from purchase transactions to identify batchNumber
          // (Purchase transactions store batchNumber in narration as "Purchase XXX Batch: NNNNN")
          const batchNumberMap = new Map<string, string>();
          for (const tx of sortedBatches) {
            const narr = tx.narration || '';
            const batchMatch = narr.match(/Batch:\s*(\S+)/);
            if (batchMatch) {
              batchNumberMap.set(tx._id.toString(), batchMatch[1]);
            }
          }

          let excessRemaining = excessStock;
          for (const ret of returnAgg) {
            if (excessRemaining <= 0) break;
            const retBatch = ret._id || '';
            const retQty = Math.min(ret.totalReturned, excessRemaining);

            // Find the matching batch row by batchNumber
            // Purchase tx narrations contain "Batch: XXXXX" — match against that
            const matchIdx = batchRows.findIndex((row) => {
              const txId = row.rowId;
              const mappedBatch = batchNumberMap.get(txId);
              return mappedBatch === retBatch;
            });

            if (matchIdx >= 0) {
              batchRows[matchIdx].qtyAvailable += retQty;
              batchRows[matchIdx].totalPurchaseRate = batchRows[matchIdx].qtyAvailable * batchRows[matchIdx].purchaseRate;
              excessRemaining -= retQty;
            } else {
              // Batch was sold out but returns brought stock back — find it in sortedBatches
              const rawMatch = sortedBatches.find((tx) => {
                const narr = tx.narration || '';
                const bm = narr.match(/Batch:\s*(\S+)/);
                return bm && bm[1] === retBatch;
              });
              if (rawMatch) {
                const sellerUserId = rawMatch.createdBy?.toString() ?? null;
                batchRows.push({
                  rowId: rawMatch._id.toString(),
                  productId: pid,
                  imei: prod.imei ?? '',
                  itemName: prod.name,
                  batchNumber: rawMatch.batchNumber || (rawMatch.narration?.match(/Batch:\s*(\S+)/)?.[1]) || null,
                  itemGroup: prod.itemGroup ?? '',
                  brand: prod.brand ?? '',
                  category: categoryName,
                  qtyAvailable: retQty,
                  purchaseRate: rawMatch.costPrice ?? 0,
                  totalPurchaseRate: retQty * (rawMatch.costPrice ?? 0),
                  sellingPrice: prod.sellingPrice ?? prod.retailPrice ?? 0,
                  retailPrice: prod.retailPrice ?? 0,
                  wholesalePrice: prod.wholesalePrice ?? 0,
                  specialPrice1: prod.specialPrice ?? 0,
                  specialPrice2: prod.specialPrice2 ?? 0,
                  expiryDate: null,
                  branch: 'MAIN BRANCH',
                  sellerName: sellerUserId ? userMap.get(sellerUserId) ?? 'N/A' : 'N/A',
                });
                excessRemaining -= retQty;
              }
            }
          }

          // Fallback: any remaining excess goes to newest batch
          if (excessRemaining > 0) {
            if (batchRows.length > 0) {
              const lastRow = batchRows[batchRows.length - 1];
              lastRow.qtyAvailable += excessRemaining;
              lastRow.totalPurchaseRate = lastRow.qtyAvailable * lastRow.purchaseRate;
            } else if (sortedBatches.length > 0) {
              const lastTx = sortedBatches[sortedBatches.length - 1];
              const sellerUserId = lastTx.createdBy?.toString() ?? null;
              batchRows.push({
                rowId: lastTx._id.toString(),
                productId: pid,
                imei: prod.imei ?? '',
                itemName: prod.name,
                batchNumber: lastTx.batchNumber || (lastTx.narration?.match(/Batch:\s*(\S+)/)?.[1]) || null,
                itemGroup: prod.itemGroup ?? '',
                brand: prod.brand ?? '',
                category: categoryName,
                qtyAvailable: excessRemaining,
                purchaseRate: lastTx.costPrice ?? 0,
                totalPurchaseRate: excessRemaining * (lastTx.costPrice ?? 0),
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
        }

        items.push(...batchRows);
      }
    } else {
      // No batches – still show the product as a single row
      const stock = stockMap.get(pid);
      const qtyAvailable = stock?.qtyAvailable ?? 0;
      const sellerUserId = stock?.lastCreatedBy ?? prod.createdBy?.toString() ?? null;

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
        purchaseRate: prod.purchasePrice ?? 0,
        totalPurchaseRate: qtyAvailable * (prod.purchasePrice ?? 0),
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

  // 2. Last purchase rate & date per product (most recent Purchase/Opening transaction)
  const lastPurchaseAgg = await InventoryTransaction.aggregate([
    {
      $match: {
        companyId: companyOid,
        type: { $in: ['Purchase', 'Opening'] },
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
      },
    },
  ]);

  const lastPurchaseMap = new Map<
    string,
    { rate: number; date: Date | null; qty: number; supplierId: string | null; batchNumber: string | null }
  >();
  for (const item of lastPurchaseAgg) {
    lastPurchaseMap.set(item._id.toString(), {
      rate: item.lastPurchaseRate ?? 0,
      date: item.lastPurchaseDate ?? null,
      qty: item.lastPurchaseQty ?? 0,
      supplierId: item.lastSupplierId?.toString() ?? null,
      batchNumber: item.lastBatchNumber || (item.lastNarration?.match(/Batch:\s*(\S+)/)?.[1]) || null,
    });
  }

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
      totalPurchaseRate: qtyAvailable * purchaseRate,
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
