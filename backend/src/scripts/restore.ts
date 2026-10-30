import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

async function runRestore() {
  const backupRoot = path.resolve(process.cwd(), '..', 'backups');
  if (!fs.existsSync(backupRoot)) {
    console.error('❌ No backups directory found at:', backupRoot);
    process.exit(1);
  }

  // Get argument or pick the latest backup
  let chosenDir = process.argv[2];
  if (!chosenDir) {
    const entries = fs
      .readdirSync(backupRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith('backup-'))
      .map((d) => d.name)
      .sort();

    if (entries.length === 0) {
      console.error('❌ No backups found in:', backupRoot);
      process.exit(1);
    }
    chosenDir = path.join(backupRoot, entries[entries.length - 1]);
    console.log(`ℹ️ No backup path specified. Using latest: ${chosenDir}`);
  } else {
    if (!path.isAbsolute(chosenDir)) {
      chosenDir = path.resolve(backupRoot, chosenDir);
    }
  }

  if (!fs.existsSync(chosenDir)) {
    console.error(`❌ Backup directory does not exist: ${chosenDir}`);
    process.exit(1);
  }

  console.log('🔄 Connecting to MongoDB for restore...');
  console.log(`📡 URI: ${config.mongodbUri}`);
  await mongoose.connect(config.mongodbUri);
  console.log('✅ Connected to MongoDB.');

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not established');
  }

  const files = fs.readdirSync(chosenDir).filter((f) => f.endsWith('.json') && f !== '_metadata.json');
  console.log(`📦 Found ${files.length} collection dumps to restore.`);

  for (const file of files) {
    const colName = file.replace('.json', '');
    const filePath = path.join(chosenDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const docs = mongoose.mongo.BSON.EJSON.parse(content) as Array<Record<string, unknown>>;

    const col = db.collection(colName);
    await col.deleteMany({});
    if (docs.length > 0) {
      await col.insertMany(docs);
    }
    console.log(`  ✅ Restored ${colName}: ${docs.length} documents.`);
  }

  console.log('\n🎉 Restore completed successfully!');
  await mongoose.disconnect();
}

runRestore().catch((err) => {
  console.error('❌ Restore failed:', err);
  process.exit(1);
});
