import mongoose from 'mongoose';
import { AuditLog, IAuditLog, AuditAction } from '../models/AuditLog';

export async function list(
  opts: {
    companyId?: string;
    userId?: string;
    entityType?: string;
    form?: string;
    action?: string;
    entryNo?: string;
    search?: string;
    fromDate?: Date;
    toDate?: Date;
    page?: number;
    limit?: number;
  } = {}
): Promise<{ logs: IAuditLog[]; total: number }> {
  const conditions: any[] = [];

  if (opts.companyId) {
    conditions.push({
      $or: [
        { companyId: new mongoose.Types.ObjectId(opts.companyId) },
        { companyId: { $exists: false } },
        { companyId: null },
      ],
    });
  }

  if (opts.userId) {
    conditions.push({ userId: new mongoose.Types.ObjectId(opts.userId) });
  }

  if (opts.form && opts.form !== 'ALL') {
    const formRegex = new RegExp(`^${opts.form.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}$`, 'i');
    conditions.push({
      $or: [{ form: formRegex }, { entityType: formRegex }],
    });
  } else if (opts.entityType && opts.entityType !== 'ALL') {
    conditions.push({ entityType: opts.entityType });
  }

  if (opts.action && opts.action !== 'ALL') {
    if (opts.action === 'Saved') {
      conditions.push({ action: { $in: ['Saved', 'Create', 'create'] } });
    } else if (opts.action === 'Edited') {
      conditions.push({ action: { $in: ['Edited', 'Update', 'update'] } });
    } else if (opts.action === 'Deleted') {
      conditions.push({ action: { $in: ['Deleted', 'Delete', 'delete'] } });
    } else {
      conditions.push({ action: opts.action });
    }
  }

  if (opts.entryNo) {
    const entryRegex = new RegExp(opts.entryNo.trim(), 'i');
    conditions.push({
      $or: [{ entryNo: entryRegex }, { entityId: entryRegex }],
    });
  }

  if (opts.fromDate || opts.toDate) {
    const timeFilter: Record<string, Date> = {};
    if (opts.fromDate) {
      const d = new Date(opts.fromDate);
      d.setHours(0, 0, 0, 0);
      timeFilter.$gte = d;
    }
    if (opts.toDate) {
      const d = new Date(opts.toDate);
      d.setHours(23, 59, 59, 999);
      timeFilter.$lte = d;
    }
    conditions.push({ timestamp: timeFilter });
  }

  if (opts.search) {
    const searchRegex = new RegExp(opts.search.trim(), 'i');
    conditions.push({
      $or: [
        { details: searchRegex },
        { entryNo: searchRegex },
        { entityId: searchRegex },
        { systemName: searchRegex },
        { salesType: searchRegex },
        { voucherType: searchRegex },
        { form: searchRegex },
        { entityType: searchRegex },
      ],
    });
  }

  const filter = conditions.length > 0 ? { $and: conditions } : {};
  const total = await AuditLog.countDocuments(filter);
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 50, 500);
  const logs = (await AuditLog.find(filter)
    .populate('userId', 'username fullName role')
    .sort({ timestamp: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean()) as unknown as IAuditLog[];
  return { logs, total };
}

export async function logEvent(data: {
  companyId?: string;
  userId?: string;
  form?: string;
  entityType?: string;
  entityId?: string;
  action: AuditAction;
  details?: string;
  entryNo?: string;
  salesType?: string;
  voucherType?: string;
  editedDate?: string;
  editedTime?: string;
  eventTime?: string;
  oldAmount?: number;
  newAmount?: number;
  systemName?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const vType = data.voucherType || data.salesType || '-';
    await AuditLog.create({
      companyId: data.companyId ? new mongoose.Types.ObjectId(data.companyId) : undefined,
      userId: data.userId ? new mongoose.Types.ObjectId(data.userId) : undefined,
      timestamp: now,
      form: data.form || data.entityType || 'Sales',
      entityType: data.entityType || data.form || 'Sales',
      entityId: data.entityId,
      action: data.action,
      details: data.details,
      entryNo: data.entryNo,
      salesType: vType,
      voucherType: vType,
      editedDate: data.editedDate || dateStr,
      editedTime: data.editedTime || timeStr,
      eventTime: data.eventTime || timeStr,
      oldAmount: data.oldAmount ?? 0,
      newAmount: data.newAmount ?? 0,
      systemName: data.systemName || 'POS-TERMINAL-01',
      before: data.before,
      after: data.after,
      ip: data.ip,
      userAgent: data.userAgent,
    });
  } catch (err) {
    console.error('Error logging audit event:', err);
  }
}
