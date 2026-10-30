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

    // 7. Ensure operational child groups exist under Primary Heads
    const findOrCreateSubGroup = async (
      parentGroup: any,
      preferredCode: string,
      name: string,
      type: string
    ) => {
      let sub = await LedgerGroup.findOne({
        companyId: cid,
        $or: [
          { code: preferredCode },
          { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), parentGroupId: { $ne: null } },
          { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        ],
      });
      if (sub) {
        if (!sub.parentGroupId || sub.parentGroupId.toString() !== parentGroup._id.toString()) {
          await LedgerGroup.updateOne({ _id: sub._id }, { $set: { parentGroupId: parentGroup._id, type } });
          sub.parentGroupId = parentGroup._id;
          sub.type = type as any;
        }
        return sub;
      }
      const grpCode = await getNextGrpCode('GRP');
      sub = await LedgerGroup.create({
        companyId: cid,
        code: grpCode,
        name,
        type: type as any,
        parentGroupId: parentGroup._id,
      });
      console.log(`Created operational group: ${name} (${grpCode}) under ${parentGroup.name}`);
      return sub;
    };

    const currentAssetsGroup = await findOrCreateSubGroup(currentAsset, 'CURR_ASSETS', 'CURRENT ASSETS', 'Asset');
    const directIncomeAccGroup = await findOrCreateSubGroup(directIncome, 'DIR_INCOME_AC', 'DIRECT INCOME A/C', 'Income');
    const directExpensesAccGroup = await findOrCreateSubGroup(directExpense, 'DIR_EXP_AC', 'DIRECT EXPENSES A/C', 'Expense');
    const dutiesRecvAccGroup = await findOrCreateSubGroup(dutiesRecv, 'DUTY_RECV_AC', 'DUTIES AND TAXES RECEIVABLE A/C', 'Duties and Taxes');
    const dutiesPayAccGroup = await findOrCreateSubGroup(dutiesPay, 'DUTY_PAY_AC', 'DUTIES AND TAXES PAYABLE A/C', 'Duties and Taxes');

    // 8. VAT Accounts under their respective operational groups
    let vatRecvAcc = await LedgerAccount.findOne({ companyId: cid, name: /^vat\s*(receivable|input)$/i });
    if (vatRecvAcc) {
      await LedgerAccount.updateOne({ _id: vatRecvAcc._id }, { groupId: dutiesRecvAccGroup._id });
      console.log('Linked VAT Receivable to Duties and Taxes Receivable A/C group');
    }

    let vatPayAcc = await LedgerAccount.findOne({ companyId: cid, name: /^vat\s*(payable|output)$/i });
    if (vatPayAcc) {
      await LedgerAccount.updateOne({ _id: vatPayAcc._id }, { groupId: dutiesPayAccGroup._id });
      console.log('Linked VAT Payable to Duties and Taxes Payable A/C group');
    }

    // 9. Stock in Hand under Current Assets group
    const stkInHandAcc = await LedgerAccount.findOne({
      companyId: cid,
      $or: [
        { name: /^(stock\s*(in\s*hand)?|inventory(\s*account)?)$/i },
        { code: /^(STOCK|INV|STOCK001)$/i },
      ],
    });
    if (stkInHandAcc) {
      await LedgerAccount.updateOne(
        { _id: stkInHandAcc._id },
        { groupId: currentAssetsGroup._id, type: 'Other' }
      );
      console.log('Linked Stock in Hand to CURRENT ASSETS group');
    }

    // 10. Stock Adjustment Gain under Direct Income A/C group
    const stkGainAcc = await LedgerAccount.findOne({
      companyId: cid,
      name: /^(stock\s*adjustment\s*gain|gain\s*on\s*stock|stock\s*surplus)$/i,
    });
    if (stkGainAcc) {
      await LedgerAccount.updateOne(
        { _id: stkGainAcc._id },
        { groupId: directIncomeAccGroup._id, type: 'Revenue' }
      );
      console.log('Linked Stock Adjustment Gain to DIRECT INCOME A/C group');
    }

    // 11. Damage Account & Stock Adjustment Loss under Direct Expenses A/C group
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
      console.log('Created Damage Account under DIRECT EXPENSES A/C group');
    } else {
      await LedgerAccount.updateOne(
        { _id: dmgAcc._id },
        { groupId: directExpensesAccGroup._id, type: 'Expense', name: 'DAMAGE ACCOUNT' }
      );
      console.log('Linked and renamed Damage Account to DIRECT EXPENSES A/C group');
    }

    const stkLossAcc = await LedgerAccount.findOne({
      companyId: cid,
      name: /^(stock\s*adjustment\s*loss|loss\s*on\s*stock)$/i,
    });
    if (stkLossAcc) {
      await LedgerAccount.updateOne(
        { _id: stkLossAcc._id },
        { groupId: directExpensesAccGroup._id, type: 'Expense' }
      );
      console.log('Linked Stock Adjustment Loss to DIRECT EXPENSES A/C group');
    }

    const salesReturnAcc = await LedgerAccount.findOne({
      companyId: cid,
      name: /^(sales\s*returns?|return\s*inward)$/i,
    });
    if (salesReturnAcc) {
      await LedgerAccount.updateOne(
        { _id: salesReturnAcc._id },
        { groupId: directExpensesAccGroup._id, type: 'Expense' }
      );
      console.log('Linked Sales Returns to DIRECT EXPENSES A/C group');
    }

    // 12. Ensure NO ledger is attached directly to a root primary head (parentGroupId: null)
    const primaryHeads = [
      fixedAsset, currentAsset, fixedLiab, currentLiab, capital,
      directIncome, indirectIncome, directExpense, indirectExpense,
      dutiesRecv, dutiesPay
    ];
    const primaryHeadIds = new Set(primaryHeads.map((h) => h._id.toString()));

    const fallbackChildMap: Record<string, any> = {
      [currentAsset._id.toString()]: currentAssetsGroup,
      [directIncome._id.toString()]: directIncomeAccGroup,
      [directExpense._id.toString()]: directExpensesAccGroup,
      [dutiesRecv._id.toString()]: dutiesRecvAccGroup,
      [dutiesPay._id.toString()]: dutiesPayAccGroup,
    };

    const allAccounts = await LedgerAccount.find({ companyId: cid });
    for (const acc of allAccounts) {
      const gIdStr = acc.groupId ? acc.groupId.toString() : '';
      if (!gIdStr || primaryHeadIds.has(gIdStr)) {
        let targetSubGroup = fallbackChildMap[gIdStr];
        if (!targetSubGroup && gIdStr) {
          const head = primaryHeads.find((h) => h._id.toString() === gIdStr);
          if (head) {
            targetSubGroup = await findOrCreateSubGroup(head, `${head.code}_AC`, `${head.name} A/C`, head.type);
            fallbackChildMap[gIdStr] = targetSubGroup;
          }
        }
        if (targetSubGroup) {
          await LedgerAccount.updateOne({ _id: acc._id }, { groupId: targetSubGroup._id });
          console.log(`Re-parented account "${acc.name}" from root head to group "${targetSubGroup.name}"`);
        }
      }
    }

    // Clean up empty auto-created Expense Groups (e.g. GRP0019)
    const emptyExpenseGroups = await LedgerGroup.find({
      companyId: cid,
      name: /^(Expense Group)$/i,
    });
    for (const eg of emptyExpenseGroups) {
      const count = await LedgerAccount.countDocuments({ groupId: eg._id });
      const childCount = await LedgerGroup.countDocuments({ parentGroupId: eg._id });
      if (count === 0 && childCount === 0) {
        await LedgerGroup.deleteOne({ _id: eg._id });
        console.log(`Cleaned up empty group: ${eg.name} (${eg.code})`);
      }
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
