import { LedgerGroup, ILedgerGroup } from '../models/LedgerGroup';
import { LedgerAccount } from '../models/LedgerAccount';
import { AppError } from '../middlewares/errorHandler';

export async function listByCompany(companyId: string, search?: string): Promise<ILedgerGroup[]> {
  const filter: Record<string, unknown> = { companyId };
  if (search && search.trim()) {
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { code: new RegExp(search, 'i') },
    ];
  }
  return LedgerGroup.find(filter).populate('parentGroupId', 'name code').sort({ type: 1, code: 1 }).lean() as unknown as ILedgerGroup[];
}

export async function getById(groupId: string, companyId: string): Promise<ILedgerGroup | null> {
  return LedgerGroup.findOne({ _id: groupId, companyId }).lean() as unknown as ILedgerGroup | null;
}

export async function getNextCode(companyId: string): Promise<string> {
  const prefix = 'GRP';
  const last = await LedgerGroup.findOne({ companyId, code: new RegExp(`^${prefix}`) })
    .sort({ code: -1 })
    .lean();
  if (!last?.code) return `${prefix}0001`;
  const match = last.code.match(/(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}${num.toString().padStart(4, '0')}`;
}

export interface CreateLedgerGroupInput {
  companyId: string;
  name: string;
  code?: string;
  type: ILedgerGroup['type'];
  parentGroupId?: string;
  createdBy?: string;
}

export async function create(input: CreateLedgerGroupInput): Promise<ILedgerGroup> {
  const code = input.code || await getNextCode(input.companyId);
  const existing = await LedgerGroup.findOne({ companyId: input.companyId, code });
  if (existing) throw new AppError('Group code already exists', 400);

  // Check for duplicate name (case-insensitive) within the same company
  const duplicateName = await LedgerGroup.findOne({
    companyId: input.companyId,
    name: new RegExp(`^${input.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  });
  if (duplicateName) throw new AppError('Group name already exists', 400);

  const group = await LedgerGroup.create({
    companyId: input.companyId,
    name: input.name,
    code,
    type: input.type,
    parentGroupId: input.parentGroupId,
    createdBy: input.createdBy,
  });
  return group.toObject();
}

export async function update(
  groupId: string,
  companyId: string,
  updates: { name?: string; type?: ILedgerGroup['type']; parentGroupId?: string }
): Promise<ILedgerGroup> {
  // Check for duplicate name (case-insensitive) if name is being updated
  if (updates.name) {
    const duplicateName = await LedgerGroup.findOne({
      companyId,
      name: new RegExp(`^${updates.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      _id: { $ne: groupId },
    });
    if (duplicateName) throw new AppError('Group name already exists', 400);
  }

  const group = await LedgerGroup.findOneAndUpdate(
    { _id: groupId, companyId },
    { $set: updates },
    { new: true }
  ).lean();
  if (!group) throw new AppError('Group not found', 404);
  return group as unknown as ILedgerGroup;
}

export async function remove(groupId: string, companyId: string): Promise<void> {
  // Check if group has ledger accounts
  const accountCount = await LedgerAccount.countDocuments({ groupId, companyId });
  if (accountCount > 0) {
    throw new AppError('Cannot delete group. It has ledger accounts associated with it.', 400);
  }
  
  const result = await LedgerGroup.deleteOne({ _id: groupId, companyId });
  if (result.deletedCount === 0) throw new AppError('Group not found', 404);
}
