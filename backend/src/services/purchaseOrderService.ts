import mongoose from 'mongoose';
import { PurchaseOrder } from '../models/PurchaseOrder';
import { AppError, isDuplicateKeyError } from '../middlewares/errorHandler';

// ─── Interfaces ────────────────────────────────────────────

export interface PurchaseOrderBatchInput {
    productId: string;
    productCode?: string;
    productName?: string;
    purchasePrice: number;
    expiryDate?: string;
    quantity: number;
    discAmount?: number;
    retail?: number;
    wholesale?: number;
    specialPrice1?: number;
    specialPrice2?: number;
    batchNumber?: string;
    multiUnitId?: string;
}

export interface CreatePurchaseOrderInput {
    companyId: string;
    financialYearId: string;
    invoiceNo: string;
    supplierInvoiceNo?: string;
    date?: string;
    supplierId?: string;
    supplierName?: string;
    vatType?: 'Vat' | 'NonVat';
    taxMode?: 'inclusive' | 'exclusive';
    narration?: string;
    batches: PurchaseOrderBatchInput[];
    itemsDiscount?: number;
    otherDiscount?: number;
    otherCharges?: number;
    freightCharge?: number;
    roundOff?: number;
    createdBy?: string;
}

// ─── Create ────────────────────────────────────────────────
export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<{
    purchaseOrderId: string;
    invoiceNo: string;
    batchCount: number;
}> {
    if (!input.batches || input.batches.length === 0) {
        throw new AppError('At least one item is required', 400);
    }

    const orderDate = input.date ? new Date(input.date) : new Date();
    const orderId = new mongoose.Types.ObjectId();

    const itemsDiscount = input.itemsDiscount ?? 0;
    const otherDiscount = input.otherDiscount ?? 0;
    const otherCharges = input.otherCharges ?? 0;
    const freightCharge = input.freightCharge ?? 0;
    const roundOff = input.roundOff ?? 0;

    let totalAmount = 0;
    const batchDocs = input.batches.map((b) => {
        const gross = b.quantity * b.purchasePrice;
        const disc = b.discAmount ?? 0;
        totalAmount += gross - disc;
        return {
            productId: new mongoose.Types.ObjectId(b.productId),
            productCode: b.productCode || '',
            productName: b.productName || '',
            batchNumber: b.batchNumber || '',
            purchasePrice: b.purchasePrice,
            quantity: b.quantity,
            discAmount: disc,
            expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
            retail: b.retail ?? 0,
            wholesale: b.wholesale ?? 0,
            specialPrice1: b.specialPrice1 ?? 0,
            specialPrice2: b.specialPrice2 ?? 0,
            multiUnitId: b.multiUnitId,
        };
    });

    // Ensure unique invoiceNo to avoid duplicate key conflicts
    let invoiceNo = input.invoiceNo?.trim();
    if (!invoiceNo || await PurchaseOrder.exists({ companyId: input.companyId, invoiceNo })) {
        invoiceNo = await getNextInvoiceNo(input.companyId);
    }

    const orderPayload = {
        _id: orderId,
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        supplierInvoiceNo: input.supplierInvoiceNo,
        date: orderDate,
        supplierId: input.supplierId ? new mongoose.Types.ObjectId(input.supplierId) : undefined,
        supplierName: input.supplierName,
        vatType: input.vatType || 'Vat',
        taxMode: input.taxMode ?? 'inclusive',
        narration: input.narration,
        batches: batchDocs,
        totalAmount,
        itemsDiscount,
        otherDiscount,
        otherCharges,
        freightCharge,
        roundOff,
        createdBy: input.createdBy ? new mongoose.Types.ObjectId(input.createdBy) : undefined,
    };

    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            await PurchaseOrder.create({ ...orderPayload, invoiceNo });
            break;
        } catch (err) {
            if (!isDuplicateKeyError(err) || attempt === 7) throw err;
            invoiceNo = await getNextInvoiceNo(input.companyId);
        }
    }

    // No stock updates, no ledger/voucher entries — this is just an order

    return {
        purchaseOrderId: orderId.toString(),
        invoiceNo,
        batchCount: input.batches.length,
    };
}

// ─── Update ────────────────────────────────────────────────
export async function updatePurchaseOrder(
    orderId: string,
    input: CreatePurchaseOrderInput
): Promise<{ purchaseOrderId: string; invoiceNo: string; batchCount: number }> {
    if (!input.batches || input.batches.length === 0) {
        throw new AppError('At least one item is required', 400);
    }

    const existing = await PurchaseOrder.findById(orderId);
    if (!existing) throw new AppError('Purchase order not found', 404);

    const orderDate = input.date ? new Date(input.date) : new Date();

    const itemsDiscount = input.itemsDiscount ?? 0;
    const otherDiscount = input.otherDiscount ?? 0;
    const otherCharges = input.otherCharges ?? 0;
    const freightCharge = input.freightCharge ?? 0;
    const roundOff = input.roundOff ?? 0;

    let totalAmount = 0;
    const batchDocs = input.batches.map((b) => {
        const gross = b.quantity * b.purchasePrice;
        const disc = b.discAmount ?? 0;
        totalAmount += gross - disc;
        return {
            productId: new mongoose.Types.ObjectId(b.productId),
            productCode: b.productCode || '',
            productName: b.productName || '',
            batchNumber: b.batchNumber || '',
            purchasePrice: b.purchasePrice,
            quantity: b.quantity,
            discAmount: disc,
            expiryDate: b.expiryDate ? new Date(b.expiryDate) : undefined,
            retail: b.retail ?? 0,
            wholesale: b.wholesale ?? 0,
            specialPrice1: b.specialPrice1 ?? 0,
            specialPrice2: b.specialPrice2 ?? 0,
            multiUnitId: b.multiUnitId,
        };
    });

    await PurchaseOrder.updateOne(
        { _id: orderId },
        {
            $set: {
                invoiceNo: input.invoiceNo,
                supplierInvoiceNo: input.supplierInvoiceNo,
                date: orderDate,
                supplierId: input.supplierId ? new mongoose.Types.ObjectId(input.supplierId) : undefined,
                supplierName: input.supplierName,
                vatType: input.vatType || 'Vat',
                taxMode: input.taxMode ?? 'inclusive',
                narration: input.narration,
                batches: batchDocs,
                totalAmount,
                itemsDiscount,
                otherDiscount,
                otherCharges,
                freightCharge,
                roundOff,
            },
        }
    );

    return {
        purchaseOrderId: orderId,
        invoiceNo: input.invoiceNo,
        batchCount: input.batches.length,
    };
}

// ─── Delete ────────────────────────────────────────────────
export async function deletePurchaseOrder(id: string, companyId: string): Promise<boolean> {
    const result = await PurchaseOrder.deleteOne({ _id: id, companyId });
    return result.deletedCount > 0;
}

// ─── List ──────────────────────────────────────────────────
export async function listPurchaseOrders(
    companyId: string,
    financialYearId?: string
): Promise<{ _id: string; invoiceNo: string; date: string; supplierName: string; totalAmount: number }[]> {
    const filter: Record<string, unknown> = { companyId };
    if (financialYearId) filter.financialYearId = financialYearId;

    const docs = await PurchaseOrder.find(filter)
        .sort({ date: 1, createdAt: 1 })
        .select('invoiceNo date supplierName totalAmount')
        .lean();

    return docs.map((d) => ({
        _id: d._id.toString(),
        invoiceNo: d.invoiceNo,
        date: d.date.toISOString().split('T')[0],
        supplierName: d.supplierName || '',
        totalAmount: d.totalAmount,
    }));
}

// ─── Get by ID ─────────────────────────────────────────────
export async function getPurchaseOrderById(id: string) {
    const doc = await PurchaseOrder.findById(id)
        .populate('supplierId', 'name code')
        .lean();
    if (!doc) throw new AppError('Purchase order not found', 404);
    return formatDoc(doc);
}

// ─── Get by Invoice No ────────────────────────────────────
export async function getPurchaseOrderByInvoiceNo(companyId: string, invoiceNo: string) {
    const doc = await PurchaseOrder.findOne({ companyId, invoiceNo })
        .populate('supplierId', 'name code')
        .lean();
    if (!doc) throw new AppError('Purchase order not found', 404);
    return formatDoc(doc);
}

// ─── Next Invoice No ──────────────────────────────────────
export async function getNextInvoiceNo(companyId: string): Promise<string> {
    const docs = await PurchaseOrder.find({ companyId })
        .select('invoiceNo')
        .lean();

    let maxNum = 0;
    for (const doc of docs) {
        if (doc.invoiceNo) {
            const match = doc.invoiceNo.match(/PO-(\d+)/i);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) {
                    maxNum = num;
                }
            }
        }
    }

    const nextNum = maxNum + 1;
    return `PO-${String(nextNum).padStart(4, '0')}`;
}

// ─── Format doc for API response ──────────────────────────
function formatDoc(doc: any) {
    const supplier = doc.supplierId as any;
    return {
        _id: doc._id.toString(),
        companyId: doc.companyId.toString(),
        financialYearId: doc.financialYearId.toString(),
        invoiceNo: doc.invoiceNo,
        supplierInvoiceNo: doc.supplierInvoiceNo || '',
        date: doc.date.toISOString().split('T')[0],
        supplierId: supplier && typeof supplier === 'object' ? supplier._id?.toString() : (doc.supplierId?.toString() || ''),
        supplierName: doc.supplierName || (supplier && typeof supplier === 'object' ? supplier.name : '') || '',
        vatType: doc.vatType || 'Vat',
        taxMode: doc.taxMode ?? 'inclusive',
        narration: doc.narration || '',
        totalAmount: doc.totalAmount,
        itemsDiscount: doc.itemsDiscount ?? 0,
        otherDiscount: doc.otherDiscount ?? 0,
        otherCharges: doc.otherCharges ?? 0,
        freightCharge: doc.freightCharge ?? 0,
        roundOff: doc.roundOff ?? 0,
        batches: (doc.batches || []).map((b: any) => ({
            productId: b.productId.toString(),
            productCode: b.productCode || '',
            productName: b.productName || '',
            batchNumber: b.batchNumber || '',
            purchasePrice: b.purchasePrice,
            quantity: b.quantity,
            discAmount: b.discAmount ?? 0,
            expiryDate: b.expiryDate ? new Date(b.expiryDate).toISOString().split('T')[0] : '',
            retail: b.retail ?? 0,
            wholesale: b.wholesale ?? 0,
            specialPrice1: b.specialPrice1 ?? 0,
            specialPrice2: b.specialPrice2 ?? 0,
            multiUnitId: b.multiUnitId,
        })),
    };
}
