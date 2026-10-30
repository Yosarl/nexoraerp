import mongoose, { Document, Schema } from 'mongoose';

export interface IPatient extends Document {
  companyId: mongoose.Types.ObjectId;
  emiratesId: string;
  firstName: string;
  familyName?: string;
  fullName: string;
  dob?: string;
  gender?: 'Female' | 'Male' | 'Unknown';
  mrn?: string;
  phone?: string;
  language?: string;
  emirate?: string;
  city?: string;
  street?: string;
  country?: string;
  prescriptionNumber?: string;
  prescriptionDate?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PatientSchema = new Schema<IPatient>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    emiratesId: { type: String, trim: true },
    firstName: { type: String, required: true },
    familyName: { type: String, default: '' },
    fullName: { type: String, required: true },
    dob: { type: String },
    gender: { type: String, enum: ['Female', 'Male', 'Unknown'], default: 'Unknown' },
    mrn: { type: String },
    phone: { type: String },
    language: { type: String, default: 'English' },
    emirate: { type: String },
    city: { type: String },
    street: { type: String },
    country: { type: String, default: 'United Arab Emirates' },
    prescriptionNumber: { type: String },
    prescriptionDate: { type: String },
  },
  { timestamps: true }
);

PatientSchema.index({ companyId: 1, emiratesId: 1 });
PatientSchema.index({ companyId: 1, fullName: 1 });

export const Patient = mongoose.model<IPatient>('Patient', PatientSchema);
