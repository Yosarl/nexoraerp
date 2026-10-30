import mongoose, { Document, Schema } from 'mongoose';

export type AdjustmentType = 'ADD' | 'REDUCE';

export interface IStockAdjustmentItem {
  productId: mongoose.Types.ObjectId;
  productCode: string;
  productName: string;
  barcode?: string;
  batchNumber?: string;
  currentStock: number;
  adjustmentType: AdjustmentType;
  quantity: number;
  newStock: number;
  costPrice: number;
  totalValue: number;
  reason?: string;
}

export interface IStockAdjustment extends Document {
  companyId: mongoose.Types.ObjectId;
  financialYearId: mongoose.Types.ObjectId;
  adjustmentNo: string;
  entryType?: 'ADJUSTMENT' | 'DAMAGE';
  date: Date;
  reason: string;
  narration?: string;
  items: IStockAdjustmentItem[];
  totalItems: number;
  totalLossValue: number;
  totalGainValue: number;
  netAdjustmentValue: number;
  voucherId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StockAdjustmentItemSchema = new Schema<IStockAdjustmentItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productCode: { type: String, default: '' },
    productName: { type: String, default: '' },
    barcode: { type: String, default: '' },
    batchNumber: { type: String, default: '' },
    currentStock: { type: Number, required: true, default: 0 },
    adjustmentType: { type: String, enum: ['ADD', 'REDUCE'], required: true },
    quantity: { type: Number, required: true, min: 0.001 },
    newStock: { type: Number, required: true, default: 0 },
    costPrice: { type: Number, required: true, default: 0 },
    totalValue: { type: Number, required: true, default: 0 },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const StockAdjustmentSchema = new Schema<IStockAdjustment>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    financialYearId: { type: Schema.Types.ObjectId, ref: 'FinancialYear', required: true },
    adjustmentNo: { type: String, required: true },
    entryType: { type: String, enum: ['ADJUSTMENT', 'DAMAGE'], default: 'ADJUSTMENT' },
    date: { type: Date, required: true },
    reason: { type: String, required: true, default: 'Physical Discrepancy' },
    narration: { type: String, default: '' },
    items: { type: [StockAdjustmentItemSchema], default: [] },
    totalItems: { type: Number, default: 0 },
    totalLossValue: { type: Number, default: 0 },
    totalGainValue: { type: Number, default: 0 },
    netAdjustmentValue: { type: Number, default: 0 },
    voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

StockAdjustmentSchema.index({ companyId: 1, adjustmentNo: 1 }, { unique: true });
StockAdjustmentSchema.index({ companyId: 1, financialYearId: 1, date: -1 });

export const StockAdjustment = mongoose.model<IStockAdjustment>(
  'StockAdjustment',
  StockAdjustmentSchema
);
