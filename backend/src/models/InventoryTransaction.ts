import mongoose, { Document, Schema } from 'mongoose';

export type InventoryTransactionType =
  | 'Opening'
  | 'Purchase'
  | 'PurchaseReturn'
  | 'Sales'
  | 'SalesReturn'
  | 'Adjustment'
  | 'Damage'
  | 'Wastage'
  | 'Transfer'
  | 'StockTake';

export interface IInventoryTransaction extends Document {
  companyId: mongoose.Types.ObjectId;
  financialYearId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  date: Date;
  type: InventoryTransactionType;
  quantityIn: number;
  quantityOut: number;
  costPrice: number;
  taxMode?: 'inclusive' | 'exclusive';
  referenceType?: string;
  referenceId?: mongoose.Types.ObjectId;
  batchNumber?: string;
  narration?: string;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const InventoryTransactionSchema = new Schema<IInventoryTransaction>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    financialYearId: { type: Schema.Types.ObjectId, ref: 'FinancialYear', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    date: { type: Date, required: true },
    type: {
      type: String,
      enum: ['Opening', 'Purchase', 'PurchaseReturn', 'Sales', 'SalesReturn', 'Adjustment', 'Damage', 'Wastage', 'Transfer', 'StockTake'],
      required: true,
    },
    quantityIn: { type: Number, default: 0 },
    quantityOut: { type: Number, default: 0 },
    costPrice: { type: Number, default: 0 },
    taxMode: { type: String, enum: ['inclusive', 'exclusive'] },
    referenceType: { type: String },
    referenceId: { type: Schema.Types.ObjectId },
    batchNumber: { type: String },
    narration: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

InventoryTransactionSchema.index({ companyId: 1, financialYearId: 1, productId: 1, date: 1 });
InventoryTransactionSchema.index({ productId: 1, date: 1 });
InventoryTransactionSchema.index({ referenceType: 1, referenceId: 1 });

export const InventoryTransaction = mongoose.model<IInventoryTransaction>(
  'InventoryTransaction',
  InventoryTransactionSchema
);
