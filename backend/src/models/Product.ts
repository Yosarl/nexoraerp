import mongoose, { Document, Schema } from 'mongoose';

export type ProductStatus = 'active' | 'inactive';
export type VatCategory = 'standard' | 'zero' | 'exempt';

export interface IMultiUnit {
  multiUnitId: string;
  imei: string;
  conversion: number;
  price: number;
  totalPrice: number;
  unitId: mongoose.Types.ObjectId;
  wholesale?: number;
  retail?: number;
  specialPrice1?: number;
  specialPrice2?: number;
}

export interface IProduct extends Document {
  companyId: mongoose.Types.ObjectId;
  code: string;
  name: string;
  imei?: string;
  sku: string;
  internationalBarcode?: string;
  systemBarcode: string;
  itemGroup?: string;
  brand?: string;
  categoryId?: mongoose.Types.ObjectId;
  defaultVendorId?: mongoose.Types.ObjectId;
  vatPercent: number;
  unitOfMeasureId: mongoose.Types.ObjectId;
  retailPrice: number;
  wholesalePrice: number;
  purchasePrice: number;
  specialPrice?: number;
  specialPrice2?: number;
  imageUrl?: string;
  officialCode?: string;
  genericName?: string;
  medCodeProvider?: string;
  strength?: string;
  strengthUnit?: string;
  dosageForm?: string;
  manufacturer?: string;
  packageUnit?: string;
  packageSize?: string;
  routeOfAdmin?: string;
  isControlledSubstance?: boolean;
  controlledSubstance?: string;
  multiUnits: IMultiUnit[];
  allowBatches?: boolean;
  purchasePriceLegacy?: number;
  sellingPrice: number;
  mrp?: number;
  vatCategory: VatCategory;
  minStockLevel?: number;
  reorderLevel?: number;
  batchTracking?: boolean;
  expiryTracking?: boolean;
  status: ProductStatus;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const MultiUnitSchema = new Schema<IMultiUnit>(
  { 
    multiUnitId: { type: String, required: true },
    imei: String, 
    conversion: Number, 
    price: Number,
    totalPrice: { type: Number, default: 0 },
    unitId: { type: Schema.Types.ObjectId, ref: 'UnitOfMeasure' },
    wholesale: { type: Number },
    retail: { type: Number },
    specialPrice1: { type: Number },
    specialPrice2: { type: Number },
  },
  { _id: false }
);

const ProductSchema = new Schema<IProduct>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    code: { type: String },
    name: { type: String, required: true },
    imei: { type: String },
    sku: { type: String },
    internationalBarcode: { type: String },
    systemBarcode: { type: String },
    itemGroup: { type: String },
    brand: { type: String },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ProductCategory' },
    defaultVendorId: { type: Schema.Types.ObjectId, ref: 'LedgerAccount' },
    vatPercent: { type: Number, default: 5 },
    unitOfMeasureId: { type: Schema.Types.ObjectId, ref: 'UnitOfMeasure', required: true },
    retailPrice: { type: Number, default: 0 },
    wholesalePrice: { type: Number, default: 0 },
    purchasePrice: { type: Number, default: 0 },
    specialPrice: { type: Number },
    specialPrice2: { type: Number },
    imageUrl: { type: String },
    officialCode: { type: String },
    genericName: { type: String },
    medCodeProvider: { type: String },
    strength: { type: String },
    strengthUnit: { type: String },
    dosageForm: { type: String },
    manufacturer: { type: String },
    packageUnit: { type: String },
    packageSize: { type: String },
    routeOfAdmin: { type: String },
    isControlledSubstance: { type: Boolean, default: false },
    controlledSubstance: { type: String },
    multiUnits: { type: [MultiUnitSchema], default: [] },
    allowBatches: { type: Boolean, default: true },
    sellingPrice: { type: Number, default: 0 },
    mrp: { type: Number },
    vatCategory: { type: String, enum: ['standard', 'zero', 'exempt'], default: 'standard' },
    minStockLevel: { type: Number },
    reorderLevel: { type: Number },
    batchTracking: { type: Boolean, default: false },
    expiryTracking: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

ProductSchema.index({ companyId: 1, code: 1 }, { unique: true });
ProductSchema.index({ companyId: 1, name: 1 }, { unique: true });
// Unique on (companyId, imei) only when imei is a non-empty string — allows multiple products with null/empty imei
ProductSchema.index(
  { companyId: 1, imei: 1 },
  { unique: true, partialFilterExpression: { imei: { $exists: true, $gt: '' } } }
);
ProductSchema.index({ companyId: 1, name: 'text' });
ProductSchema.index({ companyId: 1, internationalBarcode: 1 }, { sparse: true });
ProductSchema.index({ companyId: 1, systemBarcode: 1 }, { sparse: true });
ProductSchema.index({ companyId: 1, officialCode: 1 }, { sparse: true });
ProductSchema.index({ companyId: 1, genericName: 1 }, { sparse: true });
ProductSchema.index({ companyId: 1, categoryId: 1 });
ProductSchema.index({ companyId: 1, defaultVendorId: 1 });

export const Product = mongoose.model<IProduct>('Product', ProductSchema);
