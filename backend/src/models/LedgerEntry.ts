import mongoose, { Document, Schema } from 'mongoose';

export interface ILedgerEntry extends Document {
  companyId: mongoose.Types.ObjectId;
  financialYearId: mongoose.Types.ObjectId;
  date: Date;
  voucherId?: mongoose.Types.ObjectId;
  referenceType?: string;
  referenceId?: mongoose.Types.ObjectId;
  referenceNo?: string;
  ledgerAccountId: mongoose.Types.ObjectId;
  debitAmount: number;
  creditAmount: number;
  narration?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const LedgerEntrySchema = new Schema<ILedgerEntry>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    financialYearId: { type: Schema.Types.ObjectId, ref: 'FinancialYear', required: true },
    date: { type: Date, required: true },
    voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher' },
    referenceType: { type: String },
    referenceId: { type: Schema.Types.ObjectId },
    referenceNo: { type: String },
    ledgerAccountId: { type: Schema.Types.ObjectId, ref: 'LedgerAccount', required: true },
    debitAmount: { type: Number, default: 0 },
    creditAmount: { type: Number, default: 0 },
    narration: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

LedgerEntrySchema.index({ companyId: 1, financialYearId: 1, date: 1 });
LedgerEntrySchema.index({ ledgerAccountId: 1, date: 1 });
LedgerEntrySchema.index({ voucherId: 1 });
LedgerEntrySchema.index({ referenceType: 1, referenceId: 1 });

export const LedgerEntry = mongoose.model<ILedgerEntry>('LedgerEntry', LedgerEntrySchema);
