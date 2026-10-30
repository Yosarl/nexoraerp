import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { LedgerGroup } from '../models/LedgerGroup';
import { LedgerAccount } from '../models/LedgerAccount';
import { Voucher } from '../models/Voucher';
import { LedgerEntry } from '../models/LedgerEntry';
import { StockAdjustment } from '../models/StockAdjustment';
import { Company } from '../models/Company';

async function migrate() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/supermarket';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const companies = await Company.find({}).lean();
  console.log(`Found ${companies.length} companies.`);

  for (const company of companies) {
    const cid = company._id;
    console.log(`\nProcessing company: ${company.name} (${cid})`);

    // 1. Find DIRECT EXPENSES A/C group
    let directExpensesAccGroup = await LedgerGroup.findOne({
      companyId: cid,
      name: 'DIRECT EXPENSES A/C',
    });

    if (!directExpensesAccGroup) {
      // Find parent DIRECT EXPENSES
      let directExpensesGroup = await LedgerGroup.findOne({
        companyId: cid,
        name: 'DIRECT EXPENSES',
      });
      if (!directExpensesGroup) {
        directExpensesGroup = await LedgerGroup.create({
          companyId: cid,
          name: 'DIRECT EXPENSES',
          code: 'DIR_EXP',
          type: 'EXPENSE',
        });
      }
      directExpensesAccGroup = await LedgerGroup.create({
        companyId: cid,
        name: 'DIRECT EXPENSES A/C',
        code: 'DIR_EXP_AC',
        type: 'EXPENSE',
        parentGroupId: directExpensesGroup._id,
      });
    }

    // 2. Find or create DAMAGE ACCOUNT ledger account under DIRECT EXPENSES A/C
    let dmgAcc = await LedgerAccount.findOne({
      companyId: cid,
      name: /^(damage\s*account|damage\s*a\/?c|damage|stock\s*adjustment)$/i,
    });

    if (!dmgAcc) {
      dmgAcc = await LedgerAccount.create({
        companyId: cid,
        name: 'DAMAGE ACCOUNT',
        code: 'DMG001',
        groupId: directExpensesAccGroup._id,
        type: 'Expense',
        openingBalances: [],
      });
      console.log(`Created DAMAGE ACCOUNT ledger (ID: ${dmgAcc._id}) under DIRECT EXPENSES A/C`);
    } else {
      await LedgerAccount.updateOne(
        { _id: dmgAcc._id },
        {
          $set: {
            groupId: directExpensesAccGroup._id,
            type: 'Expense',
            name: 'DAMAGE ACCOUNT',
            code: dmgAcc.code && dmgAcc.code !== 'STKADJ001' ? dmgAcc.code : 'DMG001',
          },
        }
      );
      dmgAcc.name = 'DAMAGE ACCOUNT';
      dmgAcc.code = 'DMG001';
      console.log(`Updated and renamed ledger to DAMAGE ACCOUNT (ID: ${dmgAcc._id}) under DIRECT EXPENSES A/C`);
    }

    // 3. Find STOCK ADJUSTMENT LOSS account if any
    const stockLossAcc = await LedgerAccount.findOne({
      companyId: cid,
      name: /^(stock\s*adjustment\s*loss|loss\s*on\s*stock)$/i,
    });

    // 4. Find all damage entries
    const damageAdjustments = await StockAdjustment.find({
      companyId: cid,
      $or: [
        { entryType: 'DAMAGE' },
        { adjustmentNo: /^DMG-/i },
        { reason: /damage|wastage|expired|spoilage|breakage/i },
      ],
    }).lean();

    console.log(`Found ${damageAdjustments.length} damage/wastage adjustments for company.`);

    for (const adj of damageAdjustments) {
      console.log(`- Checking damage adjustment: ${adj.adjustmentNo} (ID: ${adj._id})`);
      if (!adj.voucherId) {
        console.log(`  No voucher linked to ${adj.adjustmentNo}`);
        continue;
      }

      // Find the voucher
      const voucher = await Voucher.findById(adj.voucherId);
      if (!voucher) {
        console.log(`  Voucher ${adj.voucherId} not found in DB`);
        continue;
      }

      let voucherUpdated = false;
      for (const line of voucher.lines) {
        // If line is debit and currently points to stockLossAcc (or is not stock ledger)
        if (
          (stockLossAcc && line.ledgerAccountId.toString() === stockLossAcc._id.toString()) ||
          line.ledgerAccountId.toString() === dmgAcc._id.toString()
        ) {
          line.ledgerAccountId = dmgAcc._id as any;
          if (!line.narration || line.narration.includes('Loss on Stock Adjustment')) {
            line.narration = `Stock Damage Entry ${adj.adjustmentNo}`;
          }
          voucherUpdated = true;
        }
      }

      if (voucherUpdated) {
        await voucher.save();
        console.log(`  Updated Voucher ${voucher.voucherNo} (${voucher._id}) line to DAMAGE ACCOUNT ledger.`);
      }

      // Update ledger entries for this voucher
      if (stockLossAcc) {
        const updateResult = await LedgerEntry.updateMany(
          {
            voucherId: voucher._id,
            ledgerAccountId: stockLossAcc._id,
          },
          {
            $set: {
              ledgerAccountId: dmgAcc._id,
              narration: `Stock Damage Entry ${adj.adjustmentNo}`,
            },
          }
        );
        if (updateResult.modifiedCount > 0) {
          console.log(`  Updated ${updateResult.modifiedCount} LedgerEntry records to DAMAGE ACCOUNT ledger.`);
        }
      }
    }
  }

  console.log('\nMigration completed successfully.');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
