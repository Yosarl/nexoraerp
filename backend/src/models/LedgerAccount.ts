import mongoose, { Document, Schema } from 'mongoose';

export type LedgerAccountType =
  | 'Customer'
  | 'Supplier'
  | 'Bank'
  | 'Cash'
  | 'Expense'
  | 'Revenue'
  | 'Other'
  | 'CUSTOMER'
  | 'SUPPLIER'
  | 'BANK'
  | 'CASH'
  | 'EXPENSE'
  | 'REVENUE'
  | 'OTHER';

export interface IOpeningBalance {
  financialYearId: mongoose.Types.ObjectId;
  amount: number;
  isDebit: boolean;
}

export interface ILedgerAccount extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  aliasName?: string;
  code: string;
  groupId: mongoose.Types.ObjectId;
  type: LedgerAccountType;
  phone?: string;
  mobile?: string;
  email?: string;
  address?: string;
  location?: string;
  pincode?: string;
  TRN?: string;
  state?: string;
  stateCode?: string;
  costCentre?: string;
  creditLimit?: number;
  creditDays?: number;
  paymentTerms?: string;
  openingBalances: IOpeningBalance[];
  serviceItem?: boolean;
  sacHsn?: string;
  taxable?: boolean;
  area?: string;
  route?: string;
  day?: string;
  district?: string;
  districtCode?: string;
  agency?: string;
  regDate?: Date;
  discPercent?: number;
  category?: string;
  rateType?: string;
  remarks?: string;
  rating?: string;
  story?: string;
  empCode?: string;
  salesMan?: string;
  person?: string;
  agent2?: string;
  branchId?: mongoose.Types.ObjectId;
  // Bank Details
  accountHolderName?: string;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  bankName?: string;
  branch?: string;
  // VAT Details
  vatRegistrationType?: string;
  vatRegistrationDate?: Date;
  // Mailing Details
  country?: string;
  poBox?: string;
  localLanguageDetails?: string;
  mailingName?: string;
  mailingBank?: string;
  againstRef?: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const OpeningBalanceSchema = new Schema<IOpeningBalance>(
  {
    financialYearId: { type: Schema.Types.ObjectId, ref: 'FinancialYear', required: true },
    amount: { type: Number, required: true },
    isDebit: { type: Boolean, required: true },
  },
  { _id: false }
);

const LedgerAccountSchema = new Schema<ILedgerAccount>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    name: { type: String, required: true },
    aliasName: { type: String },
    code: { type: String, required: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'LedgerGroup', required: true },
    type: {
      type: String,
      enum: [
        'Customer', 'Supplier', 'Bank', 'Cash', 'Expense', 'Revenue', 'Other',
        'CUSTOMER', 'SUPPLIER', 'BANK', 'CASH', 'EXPENSE', 'REVENUE', 'OTHER',
      ],
      required: true,
    },
    phone: { type: String },
    mobile: { type: String },
    email: { type: String },
    address: { type: String },
    location: { type: String },
    pincode: { type: String },
    TRN: { type: String },
    state: { type: String },
    stateCode: { type: String },
    costCentre: { type: String },
    creditLimit: { type: Number },
    creditDays: { type: Number },
    paymentTerms: { type: String },
    openingBalances: [OpeningBalanceSchema],
    serviceItem: { type: Boolean, default: false },
    sacHsn: { type: String },
    taxable: { type: Boolean, default: false },
    area: { type: String },
    route: { type: String },
    day: { type: String },
    district: { type: String },
    districtCode: { type: String },
    agency: { type: String },
    regDate: { type: Date },
    discPercent: { type: Number },
    category: { type: String },
    rateType: { type: String },
    remarks: { type: String },
    rating: { type: String },
    story: { type: String },
    empCode: { type: String },
    salesMan: { type: String },
    person: { type: String },
    agent2: { type: String },
    branchId: { type: Schema.Types.ObjectId, ref: 'Company' },
    // Bank Details
    accountHolderName: { type: String },
    accountNumber: { type: String },
    iban: { type: String },
    swiftCode: { type: String },
    bankName: { type: String },
    branch: { type: String },
    // VAT Details
    vatRegistrationType: { type: String },
    vatRegistrationDate: { type: Date },
    // Mailing Details
    country: { type: String },
    poBox: { type: String },
    localLanguageDetails: { type: String },
    mailingName: { type: String },
    mailingBank: { type: String },
    againstRef: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

LedgerAccountSchema.index({ companyId: 1, code: 1 }, { unique: true });
LedgerAccountSchema.index({ companyId: 1, type: 1 });
LedgerAccountSchema.index({ groupId: 1 });

export const LedgerAccount = mongoose.model<ILedgerAccount>('LedgerAccount', LedgerAccountSchema);
