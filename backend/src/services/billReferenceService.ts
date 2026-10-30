import mongoose from 'mongoose';
import { BillReference } from '../models/BillReference';

/**
 * Bill-by-bill reference service (Tally-style).
 *
 * Sales Invoice  → "New Ref" with Dr (receivable from customer)
 * Purchase Invoice → "New Ref" with Cr (payable to supplier)
 * Receipt Voucher  → "Agst Ref" with Cr (settling a customer receivable)
 * Payment Voucher  → "Agst Ref" with Dr (settling a supplier payable)
 */

// ─── Create New Reference (called when invoice is saved) ───

export interface CreateNewRefInput {
    companyId: string;
    financialYearId: string;
    ledgerAccountId: string;
    billNumber: string;
    referenceType: string; // 'SalesInvoice' | 'PurchaseInvoice'
    referenceId: string;
    date: Date;
    amount: number;
    drCr: 'Dr' | 'Cr';
    narration?: string;
}

/**
 * Create a "New Ref" entry when an invoice is saved.
 * - Sales Invoice: Debit (customer owes us)
 * - Purchase Invoice: Credit (we owe supplier)
 */
export async function createNewRef(input: CreateNewRefInput) {
    // Delete any existing New Ref for this reference (in case of update)
    await BillReference.deleteMany({
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        refType: 'New Ref',
    });

    return BillReference.create({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        ledgerAccountId: new mongoose.Types.ObjectId(input.ledgerAccountId),
        refType: 'New Ref',
        billNumber: input.billNumber,
        referenceType: input.referenceType,
        referenceId: new mongoose.Types.ObjectId(input.referenceId),
        date: input.date,
        amount: input.amount,
        drCr: input.drCr,
        narration: input.narration,
    });
}

// ─── Create Against Reference (called when payment/receipt is saved) ───

export interface CreateAgstRefInput {
    companyId: string;
    financialYearId: string;
    ledgerAccountId: string;
    billNumber: string;
    referenceType: string; // 'Voucher'
    referenceId: string;
    date: Date;
    amount: number;
    drCr: 'Dr' | 'Cr';
    narration?: string;
}

/**
 * Create an "Agst Ref" entry when a payment/receipt settles a bill.
 * - Receipt (settling sales): Credit entry
 * - Payment (settling purchase): Debit entry
 */
export async function createAgstRef(input: CreateAgstRefInput) {
    return BillReference.create({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        ledgerAccountId: new mongoose.Types.ObjectId(input.ledgerAccountId),
        refType: 'Agst Ref',
        billNumber: input.billNumber,
        referenceType: input.referenceType,
        referenceId: new mongoose.Types.ObjectId(input.referenceId),
        date: input.date,
        amount: input.amount,
        drCr: input.drCr,
        narration: input.narration,
    });
}

export async function deleteRefsBySource(referenceType: string, referenceId: string | mongoose.Types.ObjectId) {
    const isOid = mongoose.Types.ObjectId.isValid(referenceId);
    const filter: Record<string, any> = { referenceType };
    if (isOid) {
        filter.$or = [
            { referenceId: new mongoose.Types.ObjectId(referenceId) },
            { referenceId: referenceId.toString() }
        ];
    } else {
        filter.referenceId = referenceId;
    }
    await BillReference.deleteMany(filter);
}

// ─── Get outstanding bills for a party ───

export interface OutstandingBill {
    billNumber: string;
    date: string;
    totalAmount: number;
    settledAmount: number;
    outstandingAmount: number;
    drCr: 'Dr' | 'Cr';
    referenceType: string;
    referenceId: string;
}

/**
 * Get all outstanding (unsettled or partially settled) bills for a party.
 * Groups by billNumber: sum of "New Ref" minus sum of "Agst Ref".
 */
export async function getOutstandingBills(
    companyId: string,
    ledgerAccountId: string
): Promise<OutstandingBill[]> {
    const refs = await BillReference.find({
        companyId,
        ledgerAccountId: new mongoose.Types.ObjectId(ledgerAccountId),
    })
        .sort({ date: 1 })
        .lean();

    // Group by billNumber
    const billMap = new Map<string, {
        newRef: { amount: number; date: Date; drCr: 'Dr' | 'Cr'; referenceType: string; referenceId: string } | null;
        agstTotal: number;
    }>();

    for (const ref of refs) {
        const key = ref.billNumber;
        if (!billMap.has(key)) {
            billMap.set(key, { newRef: null, agstTotal: 0 });
        }
        const entry = billMap.get(key)!;
        if (ref.refType === 'New Ref') {
            entry.newRef = {
                amount: ref.amount,
                date: ref.date,
                drCr: ref.drCr,
                referenceType: ref.referenceType,
                referenceId: ref.referenceId.toString(),
            };
        } else {
            entry.agstTotal += ref.amount;
        }
    }

    const result: OutstandingBill[] = [];
    for (const [billNumber, data] of billMap) {
        if (!data.newRef) continue;
        const outstanding = data.newRef.amount - data.agstTotal;
        if (outstanding <= 0.01) continue; // Fully settled

        result.push({
            billNumber,
            date: data.newRef.date.toISOString().split('T')[0],
            totalAmount: data.newRef.amount,
            settledAmount: data.agstTotal,
            outstandingAmount: parseFloat(outstanding.toFixed(2)),
            drCr: data.newRef.drCr,
            referenceType: data.newRef.referenceType,
            referenceId: data.newRef.referenceId,
        });
    }

    return result;
}

/**
 * Get all bill references (both New Ref and Agst Ref) for a party — full history.
 */
export async function getBillHistory(
    companyId: string,
    ledgerAccountId: string
) {
    const refs = await BillReference.find({
        companyId,
        ledgerAccountId: new mongoose.Types.ObjectId(ledgerAccountId),
    })
        .sort({ date: 1 })
        .lean();

    return refs.map((r) => ({
        _id: r._id.toString(),
        refType: r.refType,
        billNumber: r.billNumber,
        date: r.date.toISOString().split('T')[0],
        amount: r.amount,
        drCr: r.drCr,
        referenceType: r.referenceType,
        referenceId: r.referenceId.toString(),
        narration: r.narration || '',
    }));
}
