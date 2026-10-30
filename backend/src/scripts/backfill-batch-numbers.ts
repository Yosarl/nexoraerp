import { connectDb } from '../config/db';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { PurchaseInvoice } from '../models/PurchaseInvoice';

async function main() {
  await connectDb();
  console.log('Connected to DB');

  // 1. Backfill from narration: "Purchase ... Batch: 02"
  const missingTxns = await InventoryTransaction.find({
    $or: [{ batchNumber: { $exists: false } }, { batchNumber: null }, { batchNumber: '' }, { batchNumber: 'undefined' }],
  });

  console.log(`Found ${missingTxns.length} transactions without explicit batchNumber.`);
  let updatedCount = 0;

  for (const tx of missingTxns) {
    let bn: string | null = null;

    if (tx.narration) {
      const m = tx.narration.match(/Batch:\s*(\S+)/i);
      if (m && m[1]) {
        bn = m[1].trim();
      }
    }

    if (!bn && tx.referenceType === 'Purchase' && tx.referenceId) {
      const pi = await PurchaseInvoice.findById(tx.referenceId).lean();
      if (pi && pi.batches) {
        const matchBatch = pi.batches.find((b: any) => String(b.productId) === String(tx.productId));
        if (matchBatch && matchBatch.batchNumber) {
          bn = matchBatch.batchNumber.trim();
        }
      }
    }

    if (bn) {
      tx.batchNumber = bn;
      await tx.save();
      updatedCount++;
    }
  }

  console.log(`Successfully backfilled batchNumber on ${updatedCount} transactions.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
