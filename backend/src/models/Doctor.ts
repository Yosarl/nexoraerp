import mongoose, { Document, Schema } from 'mongoose';

export interface IDoctor extends Document {
  companyId: mongoose.Types.ObjectId;
  name: string;
  licenseNumber: string;
  licensingAuthority?: 'MOHAP' | 'DHA' | 'DOH' | string;
  phone?: string;
  specialty?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DoctorSchema = new Schema<IDoctor>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    name: { type: String, required: true },
    licenseNumber: { type: String, required: true },
    licensingAuthority: { type: String, default: 'MOHAP' },
    phone: { type: String },
    specialty: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

DoctorSchema.index({ companyId: 1, name: 1 });
DoctorSchema.index({ companyId: 1, licenseNumber: 1 });

export const Doctor = mongoose.model<IDoctor>('Doctor', DoctorSchema);
