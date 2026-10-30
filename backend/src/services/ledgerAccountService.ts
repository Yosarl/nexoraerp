import mongoose from 'mongoose';
import { LedgerAccount, ILedgerAccount, IOpeningBalance } from '../models/LedgerAccount';
import { LedgerEntry } from '../models/LedgerEntry';
import { SalesInvoice } from '../models/SalesInvoice';
import { Voucher } from '../models/Voucher';
import { FinancialYear } from '../models/FinancialYear';
import { AppError } from '../middlewares/errorHandler';
import { getOpeningAccountsLedger } from './openingPurchaseService';

export async function listByCompany(
  companyId: string,
  opts: { type?: string; search?: string; financialYearId?: string; lite?: boolean } = {}
): Promise<ILedgerAccount[]> {
  const filter: Record<string, unknown> = { companyId };
  if (opts.type) filter.type = opts.type;
  if (opts.search && opts.search.trim()) {
    const search = (opts.search as string).trim();
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { code: new RegExp(search, 'i') },
      { aliasName: new RegExp(search, 'i') },
    ];
  }
  const accounts = (await LedgerAccount.find(filter)
    .populate('groupId', 'name code type')
    .sort({ code: 1 })
    .lean()) as any[];

  if (accounts.length === 0) return [];
  // Entry pages only need name/code/type; skip the per-account ledger aggregation there
  if (opts.lite) return accounts as unknown as ILedgerAccount[];

  const accountIds = accounts.map((a) => a._id);
  const entryMatch: Record<string, unknown> = {
    companyId: new mongoose.Types.ObjectId(companyId),
    ledgerAccountId: { $in: accountIds },
  };
  if (opts.financialYearId) {
    entryMatch.financialYearId = new mongoose.Types.ObjectId(opts.financialYearId);
  }

  const entryAgg = await LedgerEntry.aggregate([
    { $match: entryMatch },
    {
      $group: {
        _id: '$ledgerAccountId',
        totalDebit: { $sum: '$debitAmount' },
        totalCredit: { $sum: '$creditAmount' },
      },
    },
  ]);

  const entryMap = new Map<string, { totalDebit: number; totalCredit: number }>();
  for (const e of entryAgg) {
    entryMap.set(e._id.toString(), {
      totalDebit: e.totalDebit || 0,
      totalCredit: e.totalCredit || 0,
    });
  }

  return accounts.map((acc: any) => {
    let obDebit = 0;
    let obCredit = 0;
    if (Array.isArray(acc.openingBalances)) {
      for (const ob of acc.openingBalances) {
        if (
          opts.financialYearId &&
          ob.financialYearId &&
          ob.financialYearId.toString() !== opts.financialYearId
        ) {
          continue;
        }
        if (ob.isDebit) obDebit += Number(ob.amount) || 0;
        else obCredit += Number(ob.amount) || 0;
      }
    }

    const e = entryMap.get(acc._id.toString());
    const totalDebit = obDebit + (e?.totalDebit || 0);
    const totalCredit = obCredit + (e?.totalCredit || 0);
    const net = totalDebit - totalCredit;

    return {
      ...acc,
      closingBalance: Math.abs(net),
      closingIsDebit: net >= 0,
      outstandingBalance: acc.type === 'Supplier' || acc.type === 'SUPPLIER' ? -net : net,
    };
  }) as unknown as ILedgerAccount[];
}

export async function getById(ledgerAccountId: string, companyId: string): Promise<ILedgerAccount | null> {
  return LedgerAccount.findOne({ _id: ledgerAccountId, companyId }).populate('groupId').lean() as unknown as ILedgerAccount | null;
}

export async function getNextCode(companyId: string, prefix: string): Promise<string> {
  const last = await LedgerAccount.findOne({ companyId, code: new RegExp(`^${prefix}`) }).sort({ code: -1 }).lean();
  const num = last?.code ? parseInt(last.code.replace(/\D/g, ''), 10) + 1 : 1;
  return `${prefix}${num.toString().padStart(4, '0')}`;
}

export interface CreateLedgerAccountInput {
  companyId: string;
  name: string;
  aliasName?: string;
  code?: string;
  groupId: string;
  type: ILedgerAccount['type'];
  phone?: string;
  mobile?: string;
  email?: string;
  address?: string;
  location?: string;
  pincode?: string;
  TRN?: string;
  state?: string;
  stateCode?: string;
  costCentre?: string;
  creditLimit?: number;
  creditDays?: number;
  paymentTerms?: string;
  financialYearId?: string;
  openingBalanceDr?: number;
  openingBalanceCr?: number;
  serviceItem?: boolean;
  sacHsn?: string;
  taxable?: boolean;
  area?: string;
  route?: string;
  day?: string;
  district?: string;
  districtCode?: string;
  agency?: string;
  regDate?: Date;
  discPercent?: number;
  category?: string;
  rateType?: string;
  remarks?: string;
  rating?: string;
  story?: string;
  empCode?: string;
  salesMan?: string;
  person?: string;
  agent2?: string;
  branchId?: string;
  // Bank Details
  accountHolderName?: string;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  bankName?: string;
  branch?: string;
  // VAT Details
  vatRegistrationType?: string;
  vatRegistrationDate?: Date;
  // Mailing Details
  country?: string;
  poBox?: string;
  localLanguageDetails?: string;
  mailingName?: string;
  mailingBank?: string;
  againstRef?: boolean;
  reconciliation?: boolean;
  isCardAccount?: boolean;
  cardAccount?: boolean;
  createdBy?: string;
}

export async function create(input: CreateLedgerAccountInput): Promise<ILedgerAccount> {
  const code = input.code || await getNextCode(input.companyId, input.type === 'Customer' ? 'CUST' : input.type === 'Supplier' ? 'SUP' : 'ACC');
  const existing = await LedgerAccount.findOne({ companyId: input.companyId, code });
  if (existing) throw new AppError('Code already exists', 400);

  // Check for duplicate name (case-insensitive) within the same company
  const duplicateName = await LedgerAccount.findOne({
    companyId: input.companyId,
    name: new RegExp(`^${input.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  });
  if (duplicateName) throw new AppError('Ledger account name already exists', 400);

  const openingBalances: IOpeningBalance[] = [];
  if (input.financialYearId && (Number(input.openingBalanceDr) > 0 || Number(input.openingBalanceCr) > 0)) {
    const dr = Number(input.openingBalanceDr) || 0;
    const cr = Number(input.openingBalanceCr) || 0;
    const net = dr - cr;
    if (Math.abs(net) > 0.001) {
      openingBalances.push({
        financialYearId: new mongoose.Types.ObjectId(input.financialYearId),
        amount: Math.abs(net),
        isDebit: net > 0,
      });
    }
  }

  const account = await LedgerAccount.create({
    companyId: input.companyId,
    name: input.name,
    aliasName: input.aliasName,
    code,
    groupId: input.groupId,
    type: input.type,
    phone: input.phone,
    mobile: input.mobile,
    email: input.email,
    address: input.address,
    location: input.location,
    pincode: input.pincode,
    TRN: input.TRN,
    state: input.state,
    stateCode: input.stateCode,
    costCentre: input.costCentre,
    creditLimit: input.creditLimit,
    creditDays: input.creditDays,
    paymentTerms: input.paymentTerms,
    openingBalances,
    serviceItem: input.serviceItem,
    sacHsn: input.sacHsn,
    taxable: input.taxable,
    area: input.area,
    route: input.route,
    day: input.day,
    district: input.district,
    districtCode: input.districtCode,
    agency: input.agency,
    regDate: input.regDate,
    discPercent: input.discPercent,
    category: input.category,
    rateType: input.rateType,
    remarks: input.remarks,
    rating: input.rating,
    story: input.story,
    empCode: input.empCode,
    salesMan: input.salesMan,
    person: input.person,
    agent2: input.agent2,
    branchId: input.branchId ? new mongoose.Types.ObjectId(input.branchId) : undefined,
    accountHolderName: input.accountHolderName,
    accountNumber: input.accountNumber,
    iban: input.iban,
    swiftCode: input.swiftCode,
    bankName: input.bankName,
    branch: input.branch,
    vatRegistrationType: input.vatRegistrationType,
    vatRegistrationDate: input.vatRegistrationDate,
    country: input.country,
    poBox: input.poBox,
    localLanguageDetails: input.localLanguageDetails,
    mailingName: input.mailingName,
    mailingBank: input.mailingBank,
    againstRef: input.againstRef !== undefined ? input.againstRef : true,
    reconciliation: input.reconciliation !== undefined ? input.reconciliation : true,
    isCardAccount: input.isCardAccount !== undefined ? input.isCardAccount : (input.cardAccount !== undefined ? input.cardAccount : false),
    createdBy: input.createdBy,
  });

  if (openingBalances.length > 0) {
    await syncOpeningAccountsLedgerBalance(input.companyId, input.financialYearId);
  }

  return account.toObject();
}

const updateableFields = [
  'name', 'aliasName', 'phone', 'mobile', 'email', 'address', 'location', 'pincode',
  'TRN', 'state', 'stateCode', 'costCentre', 'creditLimit', 'creditDays', 'paymentTerms',
  'groupId', 'type', 'serviceItem', 'sacHsn', 'taxable', 'area', 'route', 'day', 'district',
  'districtCode', 'agency', 'regDate', 'discPercent', 'category', 'rateType', 'remarks',
  'rating', 'story', 'empCode', 'salesMan', 'person', 'agent2', 'branchId',
  'accountHolderName', 'accountNumber', 'iban', 'swiftCode', 'bankName', 'branch',
  'vatRegistrationType', 'vatRegistrationDate', 'country', 'poBox', 'localLanguageDetails',
  'mailingName', 'mailingBank', 'againstRef', 'reconciliation', 'isCardAccount',
] as const;

export async function update(
  ledgerAccountId: string,
  companyId: string,
  updates: Record<string, any>,
  updatedBy?: string
): Promise<ILedgerAccount> {
  // Check for duplicate name (case-insensitive) if name is being updated
  if (updates.name) {
    const duplicateName = await LedgerAccount.findOne({
      companyId,
      name: new RegExp(`^${updates.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      _id: { $ne: ledgerAccountId },
    });
    if (duplicateName) throw new AppError('Ledger account name already exists', 400);
  }

  const safe: Record<string, unknown> = {};
  for (const key of updateableFields) {
    if (updates[key] !== undefined) safe[key] = updates[key];
  }
  if (updates.cardAccount !== undefined && updates.isCardAccount === undefined) {
    safe.isCardAccount = updates.cardAccount;
  }

  if (updates.financialYearId) {
    const fyId = new mongoose.Types.ObjectId(String(updates.financialYearId));
    const dr = Number(updates.openingBalanceDr) || 0;
    const cr = Number(updates.openingBalanceCr) || 0;
    const net = dr - cr;

    const existingAcc = await LedgerAccount.findOne({ _id: ledgerAccountId, companyId });
    if (existingAcc) {
      const balances = (existingAcc.openingBalances || []).filter(
        (b) => b.financialYearId && b.financialYearId.toString() !== fyId.toString()
      );
      if (Math.abs(net) > 0.001) {
        balances.push({
          financialYearId: fyId,
          amount: Math.abs(net),
          isDebit: net > 0,
        });
      }
      safe['openingBalances'] = balances;
    }
  }

  const account = await LedgerAccount.findOneAndUpdate(
    { _id: ledgerAccountId, companyId },
    { ...safe, updatedBy: updatedBy ? new mongoose.Types.ObjectId(updatedBy) : undefined },
    { new: true }
  ).lean();
  if (!account) throw new AppError('Ledger account not found', 404);

  if (updates.financialYearId) {
    await syncOpeningAccountsLedgerBalance(companyId, String(updates.financialYearId));
  }

  return account as unknown as ILedgerAccount;
}

export async function remove(ledgerAccountId: string, companyId: string): Promise<void> {
  const ledgerObjectId = new mongoose.Types.ObjectId(ledgerAccountId);

  // Check for ledger entries
  const ledgerEntryCount = await LedgerEntry.countDocuments({ ledgerAccountId: ledgerObjectId });
  if (ledgerEntryCount > 0) {
    throw new AppError('Cannot delete ledger account. It has ledger entries associated with it.', 400);
  }

  // Check for sales invoices (as customer or cash account)
  const salesInvoiceCount = await SalesInvoice.countDocuments({
    $or: [
      { customerId: ledgerObjectId },
      { cashAccountId: ledgerObjectId },
      { 'paymentDetails.accountId': ledgerObjectId },
    ],
  });
  if (salesInvoiceCount > 0) {
    throw new AppError('Cannot delete ledger account. It has sales invoices associated with it.', 400);
  }

  // Check for vouchers (in lines or as bank ledger)
  const voucherCount = await Voucher.countDocuments({
    $or: [
      { 'lines.ledgerAccountId': ledgerObjectId },
      { bankLedgerId: ledgerObjectId },
    ],
  });
  if (voucherCount > 0) {
    throw new AppError('Cannot delete ledger account. It has vouchers associated with it.', 400);
  }

  const result = await LedgerAccount.deleteOne({ _id: ledgerAccountId, companyId });
  if (result.deletedCount === 0) throw new AppError('Ledger account not found', 404);

  await syncOpeningAccountsLedgerBalance(companyId);
}

export async function syncOpeningAccountsLedgerBalance(
  companyId: string,
  financialYearId?: string
): Promise<void> {
  const openingAcc = await getOpeningAccountsLedger(companyId);
  if (!openingAcc) return;

  const accounts = await LedgerAccount.find({
    companyId,
    _id: { $ne: openingAcc._id },
  }).lean();

  let fyIds: string[] = [];
  if (financialYearId) {
    fyIds = [financialYearId];
  } else {
    const allFy = await FinancialYear.find({ companyId }).lean();
    fyIds = allFy.map((f: any) => f._id.toString());
  }

  for (const acc of accounts) {
    for (const ob of (acc.openingBalances || [])) {
      if (ob.financialYearId) {
        const idStr = ob.financialYearId.toString();
        if (!fyIds.includes(idStr)) fyIds.push(idStr);
      }
    }
  }

  const existingBalances = (openingAcc.openingBalances || []).filter(
    (b: any) => b.financialYearId && !fyIds.includes(b.financialYearId.toString())
  );

  for (const fyIdStr of fyIds) {
    let otherTotalDr = 0;
    let otherTotalCr = 0;

    for (const acc of accounts) {
      const ob = (acc.openingBalances || []).find(
        (b: any) => b.financialYearId && b.financialYearId.toString() === fyIdStr
      );
      if (ob && Number(ob.amount) > 0) {
        if (ob.isDebit) otherTotalDr += Number(ob.amount);
        else otherTotalCr += Number(ob.amount);
      }
    }

    const net = otherTotalDr - otherTotalCr;
    if (Math.abs(net) > 0.001) {
      existingBalances.push({
        financialYearId: new mongoose.Types.ObjectId(fyIdStr),
        amount: Math.abs(net),
        isDebit: net < 0, // If other accounts have net Debit, Opening Accounts has Credit (isDebit: false) to balance
      });
    }
  }

  await LedgerAccount.updateOne(
    { _id: openingAcc._id },
    { $set: { openingBalances: existingBalances } }
  );
}
