import mongoose from 'mongoose';
import { Company, ICompany } from '../models/Company';
import { FinancialYear } from '../models/FinancialYear';
import { LedgerGroup } from '../models/LedgerGroup';
import { LedgerAccount } from '../models/LedgerAccount';
import { UnitOfMeasure } from '../models/UnitOfMeasure';
export interface CreateCompanyInput {
  code?: string;
  name: string;
  legalName?: string;
  address?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  address4?: string;
  address5?: string;
  location?: string;
  pincode?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  TRN?: string;
  state?: string;
  sCode?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIFSC?: string;
  country?: string;
  defaultCurrency?: string;
  vatConfig?: { standardRate?: number };
  financialYearName?: string;
  financialYearStart: Date;
  financialYearEnd: Date;
  createdBy?: string;
}

/** Returns next system-generated company code: com, com1, com2, ... */
export async function getNextCompanyCode(): Promise<string> {
  const companies = await Company.find({ code: /^com\d*$/i }).select('code').lean();
  let max = -1;
  for (const c of companies) {
    const code = (c.code || '').toLowerCase();
    if (code === 'com') max = Math.max(max, 0);
    else {
      const num = parseInt(code.replace(/^com/i, '') || '0', 10);
      if (!isNaN(num)) max = Math.max(max, num);
    }
  }
  return max < 0 ? 'com' : `com${max + 1}`;
}

export async function createCompany(input: CreateCompanyInput): Promise<ICompany> {
  const addressCombined = [input.address1, input.address2, input.address3, input.address4, input.address5]
    .filter(Boolean)
    .join(', ') || input.address;

  const codeToUse = await getNextCompanyCode();

  const company = await Company.create({
    code: codeToUse,
    name: input.name,
    legalName: input.legalName,
    address: addressCombined,
    address1: input.address1,
    address2: input.address2,
    address3: input.address3,
    address4: input.address4,
    address5: input.address5,
    location: input.location,
    pincode: input.pincode,
    phone: input.phone,
    mobile: input.mobile,
    email: input.email,
    TRN: input.TRN,
    state: input.state,
    sCode: input.sCode,
    bankName: input.bankName,
    bankAccountNo: input.bankAccountNo,
    bankIFSC: input.bankIFSC,
    country: input.country || 'UAE',
    defaultCurrency: input.defaultCurrency || 'AED',
    vatConfig: { standardRate: input.vatConfig?.standardRate ?? 5 },
    settings: { invoicePrefixSales: 'INV', invoicePrefixPurchase: 'PUR', stockValuationMethod: 'weighted_average' },
    createdBy: input.createdBy,
  });

  const fy = await FinancialYear.create({
    companyId: company._id,
    name: input.financialYearName || `FY ${new Date(input.financialYearStart).getFullYear()}`,
    startDate: input.financialYearStart,
    endDate: input.financialYearEnd,
    isCurrent: true,
    status: 'open',
    createdBy: input.createdBy,
  });

  await seedDefaultLedgerStructure(company._id, fy._id, input.createdBy);
  await seedDefaultUnits(company._id.toString(), input.createdBy);

  if (input.createdBy) {
    const { User } = await import('../models/User');
    await User.findByIdAndUpdate(input.createdBy, {
      $addToSet: { companyAccess: company._id },
    });
  }

  return company;
}

async function seedDefaultLedgerStructure(
  companyId: mongoose.Types.ObjectId,
  financialYearId: mongoose.Types.ObjectId,
  createdBy?: string
): Promise<void> {
  const cid = companyId.toString();

  // 1. Primary Heads (Sub-types / Parents) - ALL UPPERCASE
  await LedgerGroup.create({
    companyId: cid,
    code: 'FIXED_ASSET',
    name: 'FIXED ASSET',
    type: 'ASSET',
    createdBy,
  });

  const currentAssetGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'CURRENT_ASSET',
    name: 'CURRENT ASSET',
    type: 'ASSET',
    createdBy,
  });

  await LedgerGroup.create({
    companyId: cid,
    code: 'FIXED_LIAB',
    name: 'FIXED LIABILITY',
    type: 'LIABILITY',
    createdBy,
  });

  const currentLiabGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'CURRENT_LIAB',
    name: 'CURRENT LIABILITY',
    type: 'LIABILITY',
    createdBy,
  });

  const capitalGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'CAPITAL',
    name: 'CAPITAL',
    type: 'EQUITY',
    createdBy,
  });

  const capitalAccGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'GRP0005',
    name: 'CAPITAL ACCOUNT',
    type: 'EQUITY',
    parentGroupId: capitalGroup._id,
    createdBy,
  });

  const directIncomeGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'DIR_INCOME',
    name: 'DIRECT INCOME',
    type: 'INCOME',
    createdBy,
  });

  await LedgerGroup.create({
    companyId: cid,
    code: 'INDIR_INCOME',
    name: 'INDIRECT INCOME',
    type: 'INCOME',
    createdBy,
  });

  const directExpenseGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'DIR_EXP',
    name: 'DIRECT EXPENSE',
    type: 'EXPENSE',
    createdBy,
  });

  await LedgerGroup.create({
    companyId: cid,
    code: 'INDIR_EXP',
    name: 'INDIRECT EXPENSE',
    type: 'EXPENSE',
    createdBy,
  });

  const dutiesRecvGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'DUTY_RECV',
    name: 'DUTIES AND TAXES RECEIVABLE',
    type: 'DUTIES AND TAXES',
    createdBy,
  });

  const dutiesPayGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'DUTY_PAY',
    name: 'DUTIES AND TAXES PAYABLE',
    type: 'DUTIES AND TAXES',
    createdBy,
  });

  // 2. Operational Groups under Primary Heads - ALL UPPERCASE with unique group codes
  const cashGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'CASH',
    name: 'CASH',
    type: 'ASSET',
    isCash: true,
    parentGroupId: currentAssetGroup._id,
    createdBy,
  });

  const bankGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'BANK',
    name: 'BANK',
    type: 'ASSET',
    isBank: true,
    parentGroupId: currentAssetGroup._id,
    createdBy,
  });

  const receivablesGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'RECV',
    name: 'CUSTOMERS',
    type: 'ASSET',
    isReceivables: true,
    parentGroupId: currentAssetGroup._id,
    createdBy,
  });

  const payablesGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'PAY',
    name: 'SUPPLIERS',
    type: 'LIABILITY',
    isPayables: true,
    parentGroupId: currentLiabGroup._id,
    createdBy,
  });

  const salesGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'SALES',
    name: 'SALES',
    type: 'INCOME',
    isSales: true,
    parentGroupId: directIncomeGroup._id,
    createdBy,
  });

  const purchasesGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'PURCH',
    name: 'PURCHASES',
    type: 'EXPENSE',
    isPurchases: true,
    parentGroupId: directExpenseGroup._id,
    createdBy,
  });

  const salaryGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'SALARY',
    name: 'SALARY',
    type: 'EXPENSE',
    parentGroupId: directExpenseGroup._id,
    createdBy,
  });

  const currentAssetsGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'CURR_ASSETS',
    name: 'CURRENT ASSETS',
    type: 'ASSET',
    parentGroupId: currentAssetGroup._id,
    createdBy,
  });

  const directIncomeAccGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'DIR_INCOME_AC',
    name: 'DIRECT INCOME A/C',
    type: 'INCOME',
    parentGroupId: directIncomeGroup._id,
    createdBy,
  });

  const directExpensesAccGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'DIR_EXP_AC',
    name: 'DIRECT EXPENSES A/C',
    type: 'EXPENSE',
    parentGroupId: directExpenseGroup._id,
    createdBy,
  });

  const dutiesRecvAccGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'DUTY_RECV_AC',
    name: 'DUTIES AND TAXES RECEIVABLE A/C',
    type: 'DUTIES AND TAXES',
    parentGroupId: dutiesRecvGroup._id,
    createdBy,
  });

  const dutiesPayAccGroup = await LedgerGroup.create({
    companyId: cid,
    code: 'DUTY_PAY_AC',
    name: 'DUTIES AND TAXES PAYABLE A/C',
    type: 'DUTIES AND TAXES',
    parentGroupId: dutiesPayGroup._id,
    createdBy,
  });

  // 3. Default Ledger Accounts - ALL UPPERCASE with unique account codes under each group
  await LedgerAccount.create([
    { companyId: cid, name: 'CASH IN HAND', code: 'CASH001', groupId: cashGroup._id, type: 'Cash', openingBalances: [{ financialYearId, amount: 0, isDebit: true }], createdBy },
    { companyId: cid, name: 'MAIN BANK', code: 'BANK001', groupId: bankGroup._id, type: 'Bank', openingBalances: [{ financialYearId, amount: 0, isDebit: true }], createdBy },
    { companyId: cid, name: 'SALES ACCOUNT', code: 'SALES001', groupId: salesGroup._id, type: 'Revenue', openingBalances: [], createdBy },
    { companyId: cid, name: 'PURCHASE ACCOUNT', code: 'PURCH001', groupId: purchasesGroup._id, type: 'Expense', openingBalances: [], createdBy },
    { companyId: cid, name: 'Opening Purchase A/c', code: 'OPPUR001', groupId: purchasesGroup._id, type: 'Expense', openingBalances: [], createdBy },
    { companyId: cid, name: 'SALARY', code: 'SAL0001', groupId: salaryGroup._id, type: 'Expense', openingBalances: [], createdBy },
    { companyId: cid, name: 'DAMAGE ACCOUNT', code: 'DMG001', groupId: directExpensesAccGroup._id, type: 'Expense', openingBalances: [], createdBy },
    { companyId: cid, name: 'STOCK ADJUSTMENT A/C', code: 'STKADJ001', groupId: capitalAccGroup._id, type: 'Other', openingBalances: [], createdBy },
    { companyId: cid, name: 'SALES RETURNS', code: 'SALRET001', groupId: directExpensesAccGroup._id, type: 'Expense', openingBalances: [], createdBy },
    { companyId: cid, name: 'VAT RECEIVABLE', code: 'VATR001', groupId: dutiesRecvAccGroup._id, type: 'Other', openingBalances: [], createdBy },
    { companyId: cid, name: 'VAT PAYABLE', code: 'VATP001', groupId: dutiesPayAccGroup._id, type: 'Other', openingBalances: [], createdBy },
  ]);
}

async function seedDefaultUnits(_companyId: string, createdBy?: string): Promise<void> {
  // Units are now global - seed once for all companies
  const units = [
    { name: 'Piece', shortCode: 'PCS' },
    { name: 'Kilogram', shortCode: 'KG' },
    { name: 'Liter', shortCode: 'LTR' },
    { name: 'Pack', shortCode: 'PACK' },
    { name: 'Box', shortCode: 'BOX' },
  ];
  for (const u of units) {
    await UnitOfMeasure.findOneAndUpdate(
      { shortCode: u.shortCode }, // Global lookup by shortCode only
      { $setOnInsert: { name: u.name, shortCode: u.shortCode, isGlobal: true, createdBy } },
      { upsert: true }
    );
  }
}

export async function getCompaniesForUser(userId: string): Promise<ICompany[]> {
  const { User } = await import('../models/User');
  const user = await User.findById(userId);
  if (!user) return [];
  if (user.roles.includes('Admin')) {
    return Company.find({}).lean() as unknown as ICompany[];
  }
  return Company.find({ _id: { $in: user.companyAccess } }).lean() as unknown as Promise<ICompany[]>;
}

export async function getById(companyId: string): Promise<ICompany | null> {
  return Company.findById(companyId).lean() as unknown as ICompany | null;
}

export interface UpdateCompanyInput {
  code?: string;
  name?: string;
  legalName?: string;
  address?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  address4?: string;
  address5?: string;
  location?: string;
  pincode?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  TRN?: string;
  state?: string;
  sCode?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIFSC?: string;
  country?: string;
  defaultCurrency?: string;
  updatedBy?: string;
}

export async function updateCompany(
  companyId: string,
  input: UpdateCompanyInput
): Promise<ICompany | null> {
  const addressCombined = [input.address1, input.address2, input.address3, input.address4, input.address5]
    .filter(Boolean)
    .join(', ') || input.address;

  const set: Record<string, unknown> = {
    ...(input.name !== undefined && { name: input.name }),
    ...(input.legalName !== undefined && { legalName: input.legalName }),
    ...(addressCombined !== undefined && { address: addressCombined }),
    ...(input.address1 !== undefined && { address1: input.address1 }),
    ...(input.address2 !== undefined && { address2: input.address2 }),
    ...(input.address3 !== undefined && { address3: input.address3 }),
    ...(input.address4 !== undefined && { address4: input.address4 }),
    ...(input.address5 !== undefined && { address5: input.address5 }),
    ...(input.location !== undefined && { location: input.location }),
    ...(input.pincode !== undefined && { pincode: input.pincode }),
    ...(input.phone !== undefined && { phone: input.phone }),
    ...(input.mobile !== undefined && { mobile: input.mobile }),
    ...(input.email !== undefined && { email: input.email }),
    ...(input.TRN !== undefined && { TRN: input.TRN }),
    ...(input.state !== undefined && { state: input.state }),
    ...(input.sCode !== undefined && { sCode: input.sCode }),
    ...(input.bankName !== undefined && { bankName: input.bankName }),
    ...(input.bankAccountNo !== undefined && { bankAccountNo: input.bankAccountNo }),
    ...(input.bankIFSC !== undefined && { bankIFSC: input.bankIFSC }),
    ...(input.country !== undefined && input.country !== null && { country: String(input.country).trim() || 'UAE' }),
    ...(input.defaultCurrency !== undefined && { defaultCurrency: input.defaultCurrency }),
    ...(input.updatedBy && { updatedBy: input.updatedBy }),
  };

  const updated = await Company.findByIdAndUpdate(
    companyId,
    { $set: set },
    { new: true }
  ).lean();

  return updated as ICompany | null;
}
