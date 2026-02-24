export interface UnitOption {
    id: string;
    name: string;
    isMultiUnit: boolean;
    multiUnitId?: string;
    imei?: string;
    price?: number;
    conversion?: number;
    retail?: number;
    wholesale?: number;
    specialPrice1?: number;
    specialPrice2?: number;
}

export interface LineItem {
    id: string;
    productId: string;
    productCode: string;
    imei: string;
    name: string;
    unitId: string;
    unitName: string;
    availableUnits: UnitOption[];
    quantity: number;
    baseStockPieces: number;
    batchMaxPieces?: number;
    batchNumber?: string;
    price: number;
    purchasePrice: number;
    gross: number;
    discPercent: number;
    discAmount: number;
    vatAmount: number;
    total: number;
    isCommitted: boolean;
}

export interface MultiUnit {
    multiUnitId: string;
    imei?: string;
    conversion?: number;
    price?: number;
    totalPrice?: number;
    retail?: number;
    wholesale?: number;
    specialPrice1?: number;
    specialPrice2?: number;
    unitId?: { _id: string; name?: string; shortCode?: string } | string;
    _id: string;
    name?: string;
    shortCode?: string;
}

export interface Product {
    _id: string;
    code?: string;
    name: string;
    imei?: string;
    retailPrice?: number;
    wholesalePrice?: number;
    purchasePrice?: number;
    allowBatches?: boolean;
    unitOfMeasureId?: { _id: string; name?: string; shortCode?: string } | string;
    unitId?: string;
    unitName?: string;
    multiUnits?: MultiUnit[];
}

export interface Customer {
    _id: string;
    code?: string;
    name: string;
    address?: string;
    phone?: string;
}

export interface CashAccount {
    _id: string;
    code?: string;
    name: string;
}

export interface HeldInvoice {
    id: string;
    heldAt: string;
    customerName: string;
    itemCount: number;
    total: number;
    invoiceNo: string;
    date: string;
    vatType: 'Vat' | 'NonVat';
    taxMode?: 'inclusive' | 'exclusive';
    paymentType: 'Cash' | 'Credit';
    rateType: 'Retail' | 'WSale' | 'Special1' | 'Special2';
    customerId: string | null;
    customerAddress: string;
    cardAccountId: string | null;
    cardAmount: number;
    lines: LineItem[];
    cashReceived: number;
    oldBalance: number;
    otherDiscPercent: number;
    otherDiscount: number;
    otherCharges: number;
    freightCharge: number;
    lendAddLess: number;
    roundOff: number;
    narration: string;
}
