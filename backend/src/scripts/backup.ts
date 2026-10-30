import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

async function runBackup() {
  console.log('🔄 Connecting to MongoDB...');
  console.log(`📡 URI: ${config.mongodbUri}`);

  await mongoose.connect(config.mongodbUri);
  console.log('✅ Connected to MongoDB successfully.');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }

  // Create timestamped backup directory
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDirName = `backup-${timestamp}`;
  const backupRoot = path.resolve(process.cwd(), '..', 'backups');
  const targetDir = path.join(backupRoot, backupDirName);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  console.log(`📁 Saving backup to: ${targetDir}`);

  const collections = await db.collections();
  console.log(`📦 Found ${collections.length} collections.`);

  const summary: Record<string, number> = {};

  for (const col of collections) {
    const colName = col.collectionName;
    if (colName.startsWith('system.')) continue;

    const docs = await col.find({}).toArray();
    summary[colName] = docs.length;

    const filePath = path.join(targetDir, `${colName}.json`);
    const ejsonString = mongoose.mongo.BSON.EJSON.stringify(docs, undefined, 2);
    fs.writeFileSync(filePath, ejsonString, 'utf-8');

    console.log(`  💾 ${colName}: ${docs.length} documents exported.`);
  }

  // Write metadata
  const metadata = {
    createdAt: now.toISOString(),
    databaseName: db.databaseName,
    mongodbUri: config.mongodbUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'),
    totalCollections: Object.keys(summary).length,
    collections: summary,
  };

  fs.writeFileSync(
    path.join(targetDir, '_metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  );

  console.log('\n🎉 Backup completed successfully!');
  console.log(`📂 Location: ${targetDir}`);
  console.log(`📊 Summary:\n`, JSON.stringify(summary, null, 2));

  await mongoose.disconnect();
}

runBackup().catch((err) => {
  console.error('❌ Backup failed:', err);
  process.exit(1);
});
