import mongoose, { Document, Schema } from 'mongoose';

export type LedgerGroupType =
  | 'Asset'
  | 'Liability'
  | 'Equity'
  | 'Income'
  | 'Expense'
  | 'Duties and Taxes'
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'INCOME'
  | 'EXPENSE'
  | 'DUTIES AND TAXES';

export interface ILedgerGroup extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  code: string;
  parentGroupId?: mongoose.Types.ObjectId;
  type: LedgerGroupType;
  isCash?: boolean;
  isBank?: boolean;
  isReceivables?: boolean;
  isPayables?: boolean;
  isSales?: boolean;
  isPurchases?: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const LedgerGroupSchema = new Schema<ILedgerGroup>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    parentGroupId: { type: Schema.Types.ObjectId, ref: 'LedgerGroup' },
    type: {
      type: String,
      enum: [
        'Asset', 'Liability', 'Equity', 'Income', 'Expense', 'Duties and Taxes',
        'ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'DUTIES AND TAXES'
      ],
      required: true
    },
    isCash: { type: Boolean },
    isBank: { type: Boolean },
    isReceivables: { type: Boolean },
    isPayables: { type: Boolean },
    isSales: { type: Boolean },
    isPurchases: { type: Boolean },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

LedgerGroupSchema.index({ companyId: 1, code: 1 }, { unique: true });

export const LedgerGroup = mongoose.model<ILedgerGroup>('LedgerGroup', LedgerGroupSchema);
