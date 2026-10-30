import mongoose, { Document, Schema } from 'mongoose';

export interface IOpeningPurchaseBatch {
  productId: mongoose.Types.ObjectId;
  productCode: string;
  productName: string;
  batchNumber: string;
  purchasePrice: number;
  quantity: number;
  discAmount: number;
  expiryDate?: Date;
  retail: number;
  wholesale: number;
  specialPrice1: number;
  specialPrice2: number;
  multiUnitId?: string;
}

export type IOpeningStockBatch = IOpeningPurchaseBatch;

export interface IOpeningPurchaseEntry extends Document {
  companyId: mongoose.Types.ObjectId;
  financialYearId: mongoose.Types.ObjectId;
  entryNo: string;
  date: Date;
  vatType: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  narration?: string;
  batches: IOpeningPurchaseBatch[];
  totalAmount: number;
  voucherId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type IOpeningStockEntry = IOpeningPurchaseEntry;

const OpeningPurchaseBatchSchema = new Schema<IOpeningPurchaseBatch>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productCode: { type: String, default: '' },
    productName: { type: String, default: '' },
    batchNumber: { type: String, default: '' },
    purchasePrice: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 },
    discAmount: { type: Number, default: 0 },
    expiryDate: { type: Date },
    retail: { type: Number, default: 0 },
    wholesale: { type: Number, default: 0 },
    specialPrice1: { type: Number, default: 0 },
    specialPrice2: { type: Number, default: 0 },
    multiUnitId: { type: String },
  },
  { _id: false }
);

const OpeningPurchaseEntrySchema = new Schema<IOpeningPurchaseEntry>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    financialYearId: { type: Schema.Types.ObjectId, ref: 'FinancialYear', required: true },
    entryNo: { type: String, required: true },
    date: { type: Date, required: true },
    vatType: { type: String, enum: ['Vat', 'NonVat'], default: 'Vat' },
    taxMode: { type: String, enum: ['inclusive', 'exclusive'], default: 'inclusive' },
    narration: { type: String },
    batches: { type: [OpeningPurchaseBatchSchema], default: [] },
    totalAmount: { type: Number, default: 0 },
    voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

OpeningPurchaseEntrySchema.index({ companyId: 1, entryNo: 1 }, { unique: true });
OpeningPurchaseEntrySchema.index({ companyId: 1, financialYearId: 1, date: -1 });

export const OpeningPurchaseEntry = (mongoose.models.OpeningPurchaseEntry ||
  mongoose.models.OpeningStockEntry ||
  mongoose.model<IOpeningPurchaseEntry>(
    'OpeningStockEntry',
    OpeningPurchaseEntrySchema,
    'openingstockentries'
  )) as mongoose.Model<IOpeningPurchaseEntry>;

export const OpeningStockEntry = OpeningPurchaseEntry;
