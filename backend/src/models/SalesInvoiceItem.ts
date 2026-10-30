import mongoose, { Document, Schema } from 'mongoose';

export interface ISalesInvoiceItem extends Document {
  invoiceId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  productCode?: string;
  imei?: string;
  multiUnitId?: string; // Reference to product's multi-unit if used
  unitId?: string; // Unit type ID (for restoring correct unit on load)
  unitName?: string; // Unit name (for backward compatibility)
  description?: string;
  quantity: number;
  unitPrice: number;
  grossAmount: number;
  discountPercent: number;
  discount: number;
  netAmount: number;
  vatRate: number;
  vatAmount: number;
  totalAmount: number;
  costPriceAtSale: number;
  batchNumber?: string;
  expiryDate?: string;
  duration?: string;
  timing?: string;
  frequency?: string;
}

const SalesInvoiceItemSchema = new Schema<ISalesInvoiceItem>(
  {
    invoiceId: { type: Schema.Types.ObjectId, ref: 'SalesInvoice', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productCode: { type: String },
    imei: { type: String },
    multiUnitId: { type: String }, // Reference to product's multi-unit if used
    unitId: { type: String }, // Unit type ID (for restoring correct unit on load)
    unitName: { type: String }, // Unit name (for backward compatibility)
    description: { type: String },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    grossAmount: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    netAmount: { type: Number, required: true },
    vatRate: { type: Number, default: 0 },
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    costPriceAtSale: { type: Number, default: 0 },
    batchNumber: { type: String },
    expiryDate: { type: String },
    duration: { type: String },
    timing: { type: String },
    frequency: { type: String },
  },
  { _id: true }
);

SalesInvoiceItemSchema.index({ invoiceId: 1 });

export const SalesInvoiceItem = mongoose.model<ISalesInvoiceItem>('SalesInvoiceItem', SalesInvoiceItemSchema);
