/**
 * Fix E11000 duplicate key on products (companyId_1_imei_1).
 * The schema defines this index as sparse, but the DB may have an old non-sparse index.
 * This script drops the existing index so Mongoose can recreate it with sparse: true
 * (allowing multiple products with imei: null per company).
 *
 * Usage from backend folder: npx tsx src/scripts/fix-product-imei-index.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { config } from '../config';
import { Product } from '../models/Product';

const INDEX_NAME = 'companyId_1_imei_1';

async function main(): Promise<void> {
  try {
    await mongoose.connect(config.mongodbUri);
  } catch (err) {
    console.error('Could not connect to MongoDB:', (err as Error).message);
    process.exit(1);
  }

  try {
    const coll = Product.collection;
    const indexes = await coll.indexes();
    const hasImeiIndex = indexes.some((idx) => idx.name === INDEX_NAME);

    if (hasImeiIndex) {
      await coll.dropIndex(INDEX_NAME);
      console.log('Dropped index:', INDEX_NAME);
    } else {
      console.log('Index', INDEX_NAME, 'not found (already dropped or never created).');
    }

    await Product.syncIndexes();
    console.log('Synced indexes from schema (companyId_imei will be recreated as sparse).');
  } catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
  process.exit(0);
}

main();
