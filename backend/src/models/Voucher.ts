import mongoose, { Document, Schema } from 'mongoose';

export type VoucherType =
  | 'Receipt'
  | 'Payment'
  | 'Journal'
  | 'Contra'
  | 'ChequePayment'
  | 'ChequeReceipt'
  | 'Sales'
  | 'Purchase'
  | 'Opening';

export type VoucherStatus = 'Draft' | 'Posted' | 'Cancelled';

export interface IVoucherLine {
  ledgerAccountId: mongoose.Types.ObjectId;
  debitAmount: number;
  creditAmount: number;
  narration?: string;
}

export interface IVoucher extends Document {
  companyId: mongoose.Types.ObjectId;
  financialYearId: mongoose.Types.ObjectId;
  voucherType: VoucherType;
  voucherNo: string;
  date: Date;
  narration?: string;
  lines: IVoucherLine[];
  totalDebit: number;
  totalCredit: number;
  status: VoucherStatus;
  referenceType?: string;
  referenceId?: mongoose.Types.ObjectId;
  referenceNo?: string;
  chequeNumber?: string;
  chequeDate?: Date;
  bankLedgerId?: mongoose.Types.ObjectId;
  chequeStatus?: 'PENDING' | 'CLEARED' | 'BOUNCED';
  bankDate?: Date;
  isReconciled?: boolean;
  reconciledAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const VoucherLineSchema = new Schema<IVoucherLine>(
  {
    ledgerAccountId: { type: Schema.Types.ObjectId, ref: 'LedgerAccount', required: true },
    debitAmount: { type: Number, default: 0 },
    creditAmount: { type: Number, default: 0 },
    narration: { type: String },
  },
  { _id: true }
);

const VoucherSchema = new Schema<IVoucher>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    financialYearId: { type: Schema.Types.ObjectId, ref: 'FinancialYear', required: true },
    voucherType: {
      type: String,
      enum: ['Receipt', 'Payment', 'Journal', 'Contra', 'ChequePayment', 'ChequeReceipt', 'Sales', 'Purchase', 'Opening'],
      required: true,
    },
    voucherNo: { type: String, required: true },
    date: { type: Date, required: true },
    narration: { type: String },
    lines: [VoucherLineSchema],
    totalDebit: { type: Number, default: 0 },
    totalCredit: { type: Number, default: 0 },
    status: { type: String, enum: ['Draft', 'Posted', 'Cancelled'], default: 'Draft' },
    referenceType: { type: String },
    referenceId: { type: Schema.Types.ObjectId },
    referenceNo: { type: String },
    chequeNumber: { type: String },
    chequeDate: { type: Date },
    bankLedgerId: { type: Schema.Types.ObjectId, ref: 'LedgerAccount' },
    chequeStatus: {
      type: String,
      enum: ['PENDING', 'CLEARED', 'BOUNCED'],
    },
    bankDate: { type: Date },
    isReconciled: { type: Boolean, default: false },
    reconciledAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

VoucherSchema.index({ companyId: 1, financialYearId: 1, voucherNo: 1 }, { unique: true });
VoucherSchema.index({ companyId: 1, date: 1 });

export const Voucher = mongoose.model<IVoucher>('Voucher', VoucherSchema);
