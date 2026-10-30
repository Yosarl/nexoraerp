import mongoose, { Document, Schema } from 'mongoose';

export type SalesInvoiceType = 'POS' | 'B2C' | 'B2B' | 'Quotation' | 'Return';
export type SalesInvoiceStatus = 'Draft' | 'Final' | 'Cancelled' | 'Returned';
export type PaymentType = 'Cash' | 'Credit';
export type VatType = 'Vat' | 'NonVat';
export type RateType = 'Retail' | 'WSale' | 'Special1' | 'Special2';

export interface IPaymentDetail {
  mode: string;
  amount: number;
  reference?: string;
  accountId?: mongoose.Types.ObjectId;
}

export interface ISalesInvoice extends Document {
  companyId: mongoose.Types.ObjectId;
  financialYearId: mongoose.Types.ObjectId;
  invoiceNo: string;
  date: Date;
  time?: string;
  type: SalesInvoiceType;
  customerId?: mongoose.Types.ObjectId;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerTRN?: string;
  salesmanId?: mongoose.Types.ObjectId;
  locationId?: mongoose.Types.ObjectId;
  rateType: RateType;
  paymentType: PaymentType;
  vatType: VatType;
  taxMode?: 'inclusive' | 'exclusive';
  cashAccountId?: mongoose.Types.ObjectId;
  cardAccountId?: mongoose.Types.ObjectId;
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  vatAmount: number;
  otherDiscount: number;
  otherCharges: number;
  freightCharge: number;
  lendAddLess: number;
  roundOff: number;
  totalAmount: number;
  cashReceived: number;
  balance: number;
  oldBalance: number;
  netBalance: number;
  paymentDetails: IPaymentDetail[];
  narration?: string;
  // Pharmacy / Medical Fields
  emiratesId?: string;
  patientName?: string;
  doctorName?: string;
  prescriptionNumber?: string;
  prescriptionDate?: string;
  isRiayati?: boolean;
  riayatiStatus?: 'Success' | 'Partial' | 'Failed' | 'Offline' | 'NotApplicable';
  riayatiVisitNumber?: string;
  riayatiAckCode?: string;
  riayatiError?: string;
  riayatiSubmittedAt?: Date;
  // Shipping Address
  shippingName?: string;
  shippingAddress?: string;
  shippingPhone?: string;
  shippingContactPerson?: string;
  status: SalesInvoiceStatus;
  voucherId?: mongoose.Types.ObjectId;
  originalInvoiceId?: mongoose.Types.ObjectId;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const PaymentDetailSchema = new Schema<IPaymentDetail>(
  { mode: String, amount: Number, reference: String, accountId: { type: Schema.Types.ObjectId, ref: 'LedgerAccount' } },
  { _id: false }
);

const SalesInvoiceSchema = new Schema<ISalesInvoice>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    financialYearId: { type: Schema.Types.ObjectId, ref: 'FinancialYear', required: true },
    invoiceNo: { type: String, required: true },
    date: { type: Date, required: true },
    time: { type: String },
    type: { type: String, enum: ['POS', 'B2C', 'B2B', 'Quotation', 'Return'], required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'LedgerAccount' },
    customerName: { type: String },
    customerAddress: { type: String },
    customerPhone: { type: String },
    customerTRN: { type: String },
    salesmanId: { type: Schema.Types.ObjectId, ref: 'User' },
    locationId: { type: Schema.Types.ObjectId, ref: 'Location' },
    rateType: { type: String, enum: ['Retail', 'WSale', 'Special1', 'Special2'], default: 'Retail' },
    paymentType: { type: String, enum: ['Cash', 'Credit'], default: 'Cash' },
    vatType: { type: String, enum: ['Vat', 'NonVat'], default: 'Vat' },
    taxMode: { type: String, enum: ['inclusive', 'exclusive'] },
    cashAccountId: { type: Schema.Types.ObjectId, ref: 'LedgerAccount' },
    cardAccountId: { type: Schema.Types.ObjectId, ref: 'LedgerAccount' },
    grossAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    vatAmount: { type: Number, default: 0 },
    otherDiscount: { type: Number, default: 0 },
    otherCharges: { type: Number, default: 0 },
    freightCharge: { type: Number, default: 0 },
    lendAddLess: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    cashReceived: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    oldBalance: { type: Number, default: 0 },
    netBalance: { type: Number, default: 0 },
    paymentDetails: [PaymentDetailSchema],
    narration: { type: String },
    // Pharmacy / Medical Fields
    emiratesId: { type: String },
    patientName: { type: String },
    doctorName: { type: String },
    prescriptionNumber: { type: String },
    prescriptionDate: { type: String },
    isRiayati: { type: Boolean, default: false },
    riayatiStatus: { type: String, enum: ['Success', 'Partial', 'Failed', 'Offline', 'NotApplicable'] },
    riayatiVisitNumber: { type: String },
    riayatiAckCode: { type: String },
    riayatiError: { type: String },
    riayatiSubmittedAt: { type: Date },
    // Shipping Address
    shippingName: { type: String },
    shippingAddress: { type: String },
    shippingPhone: { type: String },
    shippingContactPerson: { type: String },
    status: { type: String, enum: ['Draft', 'Final', 'Cancelled', 'Returned'], default: 'Draft' },
    voucherId: { type: Schema.Types.ObjectId, ref: 'Voucher' },
    originalInvoiceId: { type: Schema.Types.ObjectId, ref: 'SalesInvoice' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

SalesInvoiceSchema.index({ companyId: 1, financialYearId: 1, invoiceNo: 1 }, { unique: true });
SalesInvoiceSchema.index({ companyId: 1, date: 1 });
SalesInvoiceSchema.index({ customerId: 1 });

export const SalesInvoice = mongoose.model<ISalesInvoice>('SalesInvoice', SalesInvoiceSchema);
