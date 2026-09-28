import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

import { connectDb } from '../config/db';
import { Company } from '../models/Company';
import { LedgerGroup } from '../models/LedgerGroup';
import { LedgerAccount } from '../models/LedgerAccount';

async function migrate() {
  await connectDb();
  console.log('Connected to MongoDB');

  const companies = await Company.find({});
  console.log(`Found ${companies.length} company/companies to process`);

  for (const company of companies) {
    const cid = company._id.toString();
    console.log(`\n=== Restructuring COA for company: ${company.name} (${cid}) ===`);

    const getNextGrpCode = async (prefix: string) => {
      const last = await LedgerGroup.findOne({ companyId: cid, code: new RegExp(`^${prefix}`) })
        .sort({ code: -1 })
        .lean();
      if (!last?.code) return `${prefix}0001`;
      const num = parseInt(last.code.replace(/\D/g, ''), 10) + 1;
      return `${prefix}${num.toString().padStart(4, '0')}`;
    };

    // 1. Remove the 5 redundant dummy wrapper groups if they exist
    const dummyCodes = ['ASSET', 'LIAB', 'EQUITY', 'INCOME', 'EXP'];
    for (const code of dummyCodes) {
      const dummy = await LedgerGroup.findOne({ companyId: cid, code });
      if (dummy) {
        // Check if any accounts are directly attached
        const accCount = await LedgerAccount.countDocuments({ groupId: dummy._id });
        if (accCount === 0) {
          await LedgerGroup.deleteOne({ _id: dummy._id });
          console.log(`Removed redundant dummy group: ${code}`);
        }
      }
    }

    // 2. Ensure Primary Heads exist with parentGroupId: null
    const findOrCreateHead = async (name: string, code: string, type: any) => {
      let head = await LedgerGroup.findOne({
        companyId: cid,
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      });
      if (!head) {
        head = await LedgerGroup.create({
          companyId: cid,
          code,
          name,
          type,
          parentGroupId: undefined,
        });
        console.log(`Created primary head: ${name} (${code}) [${type}]`);
      } else {
        await LedgerGroup.updateOne(
          { _id: head._id },
          { $set: { name, type, parentGroupId: null } }
        );
      }
      return head;
    };

    const fixedAsset = await findOrCreateHead('Fixed Asset', 'FIXED_ASSET', 'Asset');
    const currentAsset = await findOrCreateHead('Current Asset', 'CURRENT_ASSET', 'Asset');
    const fixedLiab = await findOrCreateHead('Fixed Liability', 'FIXED_LIAB', 'Liability');
    const currentLiab = await findOrCreateHead('Current Liability', 'CURRENT_LIAB', 'Liability');
    const capital = await findOrCreateHead('Capital', 'CAPITAL', 'Equity');
    const directIncome = await findOrCreateHead('Direct Income', 'DIR_INCOME', 'Income');
    const indirectIncome = await findOrCreateHead('Indirect Income', 'INDIR_INCOME', 'Income');
    const directExpense = await findOrCreateHead('Direct Expense', 'DIR_EXP', 'Expense');
    const indirectExpense = await findOrCreateHead('Indirect Expense', 'INDIR_EXP', 'Expense');
    const dutiesRecv = await findOrCreateHead('Duties and Taxes Receivable', 'DUTY_RECV', 'Duties and Taxes');
    const dutiesPay = await findOrCreateHead('Duties and Taxes Payable', 'DUTY_PAY', 'Duties and Taxes');

    // 3. Operational groups under Current Asset: Bank, Cash, Receivables
    await LedgerGroup.updateMany(
      {
        companyId: cid,
        $or: [
          { isBank: true },
          { isCash: true },
          { isReceivables: true },
          { code: { $in: ['BANK', 'CASH', 'RECV'] } },
          { name: { $in: [/^bank$/i, /^cash$/i, /^receivables?$/i] } },
        ],
      },
      { $set: { parentGroupId: currentAsset._id, type: 'Asset' } }
    );
    console.log('Linked Bank, Cash, Receivables to Current Asset');

    // 4. Operational groups under Current Liability: Payables
    await LedgerGroup.updateMany(
      {
        companyId: cid,
        $or: [
          { isPayables: true },
          { code: 'PAY' },
          { name: /^payables?$/i },
        ],
      },
      { $set: { parentGroupId: currentLiab._id, type: 'Liability' } }
    );
    console.log('Linked Payables to Current Liability');

    // 5. Operational groups under Direct Income: Sales
    await LedgerGroup.updateMany(
      {
        companyId: cid,
        $or: [
          { isSales: true },
          { code: 'SALES' },
          { name: /^sales$/i },
        ],
      },
      { $set: { parentGroupId: directIncome._id, type: 'Income' } }
    );
    console.log('Linked Sales to Direct Income');

    // 6. Operational groups under Direct Expense: Purchases & Salary
    await LedgerGroup.updateMany(
      {
        companyId: cid,
        $or: [
          { isPurchases: true },
          { code: 'PURCH' },
          { name: /^purchases?$/i },
        ],
      },
      { $set: { parentGroupId: directExpense._id, type: 'Expense' } }
    );
    console.log('Linked Purchases to Direct Expense');

    // Create or find Salary group under Direct Expense
    let salaryGroup = await LedgerGroup.findOne({
      companyId: cid,
      name: /^salary$/i,
      parentGroupId: directExpense._id,
    });
    if (!salaryGroup) {
      salaryGroup = await LedgerGroup.findOne({ companyId: cid, name: /^salary$/i });
      if (salaryGroup && salaryGroup._id.toString() !== directExpense._id.toString()) {
        await LedgerGroup.updateOne({ _id: salaryGroup._id }, { parentGroupId: directExpense._id, type: 'Expense' });
      } else {
        const salGrpCode = await getNextGrpCode('GRP');
        salaryGroup = await LedgerGroup.create({
          companyId: cid,
          code: salGrpCode,
          name: 'Salary',
          type: 'Expense',
          parentGroupId: directExpense._id,
        });
        console.log(`Created Salary group (${salGrpCode}) under Direct Expense`);
      }
    }

    // Attach Salary account to Salary group
    let salaryAcc = await LedgerAccount.findOne({ companyId: cid, name: /^salary$/i });
    if (salaryAcc && salaryGroup) {
      await LedgerAccount.updateOne({ _id: salaryAcc._id }, { groupId: salaryGroup._id, type: 'Expense' });
      console.log('Linked Salary account to Salary group');
    }

    // 7. VAT Accounts
    let vatRecvAcc = await LedgerAccount.findOne({ companyId: cid, name: /^vat\s*(receivable|input)$/i });
    if (vatRecvAcc) {
      await LedgerAccount.updateOne({ _id: vatRecvAcc._id }, { groupId: dutiesRecv._id });
    }

    let vatPayAcc = await LedgerAccount.findOne({ companyId: cid, name: /^vat\s*(payable|output)$/i });
    if (vatPayAcc) {
      await LedgerAccount.updateOne({ _id: vatPayAcc._id }, { groupId: dutiesPay._id });
    }
  }

  console.log('\nMigration completed successfully!');
  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
