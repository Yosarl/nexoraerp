import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/supermarket_inventory';

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');
  const collection = mongoose.connection.collection('products');
  
  const countWithGtin = await collection.countDocuments({ gtin: { $exists: true } });
  console.log(`Found ${countWithGtin} product documents with 'gtin' field.`);

  if (countWithGtin > 0) {
    const sample = await collection.find({ gtin: { $exists: true } }).limit(5).toArray();
    console.log('Sample before removal:', sample.map(p => ({ id: p._id, name: p.name, imei: p.imei, gtin: p.gtin })));

    // If any product has a gtin but no imei, we can preserve it as imei
    const copyResult = await collection.updateMany(
      { gtin: { $exists: true, $ne: '' }, $or: [{ imei: { $exists: false } }, { imei: '' }] },
      [{ $set: { imei: '$gtin' } }]
    );
    console.log('Migrated gtin to imei where imei was empty:', copyResult.modifiedCount);

    const unsetResult = await collection.updateMany(
      { gtin: { $exists: true } },
      { $unset: { gtin: '' } }
    );
    console.log(`Unset 'gtin' from ${unsetResult.modifiedCount} documents.`);
  }

  const remaining = await collection.countDocuments({ gtin: { $exists: true } });
  console.log(`Remaining products with 'gtin': ${remaining}`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Error during migration:', err);
  process.exit(1);
});
