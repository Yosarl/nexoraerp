import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../store';
import { productApi, ledgerAccountApi } from '../services/api';
import { getCurrentDate } from '../components/DateInput';
import { LineItem, Customer, Product, UnitOption } from '../types/sales';

export interface SalesEntryConfig {
    entryType: 'b2c' | 'return' | 'quotation';
    api: {
        create: (data: any) => Promise<any>;
        update: (id: string, data: any) => Promise<any>;
        delete: (id: string, companyId: string) => Promise<any>;
        get: (id: string, companyId: string) => Promise<any>;
        list: (companyId: string, financialYearId: string) => Promise<any>;
        getNextNo: (companyId: string, financialYearId: string) => Promise<any>;
        search?: (companyId: string, no: string) => Promise<any>;
    };
    holdStorageKey: string;
    defaultVatType?: 'Vat' | 'NonVat';
    defaultTaxMode?: 'inclusive' | 'exclusive';
}

export const VAT_RATE = 5;

export function useSalesEntry(config: SalesEntryConfig) {
    const { entryType: _entryType, api, holdStorageKey: _holdStorageKey } = config;

    const companyId = useSelector((s: RootState) => s.app.selectedCompanyId);
    const financialYearId = useSelector((s: RootState) => s.app.selectedFinancialYearId);
    const navigate = useNavigate();

    // Basic State
    const [invoiceNo, setInvoiceNo] = useState('');
    const [invoiceId, setInvoiceId] = useState<string | null>(null);
    const [date, setDate] = useState(getCurrentDate());
    const [vatType, setVatType] = useState<'Vat' | 'NonVat'>(config.defaultVatType || 'Vat');
    const [taxMode, setTaxMode] = useState<'inclusive' | 'exclusive'>(config.defaultTaxMode || 'inclusive');
    const [paymentType, setPaymentType] = useState<'Cash' | 'Credit'>('Cash');
    const [rateType, setRateType] = useState<'Retail' | 'WSale' | 'Special1' | 'Special2'>('WSale');
    const [location, setLocation] = useState('MAIN BRANCH');

    // Customer State
    const [customerId, setCustomerId] = useState<string | null>(null);
    const [customerName, setCustomerName] = useState('CASH');
    const [customerAddress, setCustomerAddress] = useState('');
    const [customers, setCustomers] = useState<Customer[]>([]);

    // Totals State
    const [otherDiscount, setOtherDiscount] = useState(0);
    const [otherDiscPercent, setOtherDiscPercent] = useState(0);
    const [otherCharges, setOtherCharges] = useState(0);
    const [freightCharge, setFreightCharge] = useState(0);
    const [roundOff, setRoundOff] = useState(0);
    const [narration, setNarration] = useState('');
    const [cashReceived, setCashReceived] = useState(0);
    const [oldBalance, setOldBalance] = useState(0);

    // Address State
    const [billingAddress, setBillingAddress] = useState('');
    const [billingPhone, setBillingPhone] = useState('');
    const [shippingName, setShippingName] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [shippingPhone, setShippingPhone] = useState('');

    // Data State
    const [products, setProducts] = useState<Product[]>([]);
    const [lines, setLines] = useState<LineItem[]>([]);
    const [invoiceIds, setInvoiceIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [isSaved, setIsSaved] = useState(false);
    const [activeLineId, setActiveLineId] = useState<string | null>(null);

    // Return Specific
    const [returnType, setReturnType] = useState<'OnAccount' | 'ByRef'>('OnAccount');

    // Dialog State
    const [errorDialogOpen, setErrorDialogOpen] = useState(false);
    const [errorDialogMessage, setErrorDialogMessage] = useState('');

    const emptyLine = useCallback((): LineItem => ({
        id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
        productId: '', productCode: '', imei: '', name: '',
        unitId: '', unitName: '', availableUnits: [],
        quantity: 0, price: 0, gross: 0, discPercent: 0, discAmount: 0, vatAmount: 0, total: 0,
        isCommitted: false, baseStockPieces: 0, purchasePrice: 0,
    }), []);

    // ── Logic Helpers ──────────────────────────────────────────────────

    const calcRowTotals = useCallback((line: LineItem, vat: 'Vat' | 'NonVat', mode: 'inclusive' | 'exclusive') => {
        const gross = parseFloat((line.quantity * line.price).toFixed(2));
        const disc = parseFloat(line.discAmount.toFixed(2));
        const net = gross - disc;

        let vatAmount = 0;
        let total = net;

        if (vat === 'Vat') {
            if (mode === 'inclusive') {
                vatAmount = parseFloat((net * VAT_RATE / (100 + VAT_RATE)).toFixed(2));
                total = net;
            } else {
                vatAmount = parseFloat((net * VAT_RATE / 100).toFixed(2));
                total = net + vatAmount;
            }
        }

        return { ...line, gross, vatAmount, total: parseFloat(total.toFixed(2)) };
    }, []);

    const updateGrandTotals = useMemo(() => {
        const itemsGross = lines.reduce((sum, l) => sum + l.gross, 0);
        const itemsDiscount = lines.reduce((sum, l) => sum + l.discAmount, 0);
        const itemsVat = lines.reduce((sum, l) => sum + l.vatAmount, 0);
        const subTotal = lines.reduce((sum, l) => sum + l.total, 0);

        // Simplification for brevity, full logic from SalesB2C should be here
        const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + roundOff;
        const totalItems = lines.reduce((sum, l) => sum + l.quantity, 0);

        return { itemsGross, itemsDiscount, itemsVat, subTotal, grandTotal, totalItems };
    }, [lines, otherDiscount, otherCharges, freightCharge, roundOff]);

    const updateLine = useCallback((id: string, field: keyof LineItem, value: any) => {
        setLines(prev => prev.map(l => {
            if (l.id !== id) return l;
            let updated = { ...l, [field]: value };

            // Handle dependent calculations
            if (field === 'quantity' || field === 'price') {
                updated.discAmount = parseFloat((updated.quantity * updated.price * updated.discPercent / 100).toFixed(2));
            } else if (field === 'discPercent') {
                updated.discAmount = parseFloat((updated.quantity * updated.price * (value as number) / 100).toFixed(2));
            } else if (field === 'discAmount') {
                const gross = updated.quantity * updated.price;
                updated.discPercent = gross > 0 ? (value as number / gross * 100) : 0;
            }

            return calcRowTotals(updated, vatType, taxMode);
        }));
    }, [vatType, taxMode, calcRowTotals]);

    const handleProductSelect = useCallback((lineId: string, product: Product | null) => {
        if (!product) {
            setLines(prev => prev.map(l => l.id === lineId ? emptyLine() : l));
            return;
        }

        const availableUnits: UnitOption[] = [];
        if (product.unitId) {
            availableUnits.push({ id: product.unitId, name: product.unitName || 'Pcs', isMultiUnit: false });
        }
        // ... add multi-units if any ...

        setLines(prev => prev.map(l => {
            if (l.id !== lineId) return l;
            const price = rateType === 'WSale' ? (product.wholesalePrice || 0) : (product.retailPrice || 0);
            const updated: LineItem = {
                ...l,
                productId: product._id,
                productCode: product.code || '',
                name: product.name,
                unitId: product.unitId || '',
                unitName: product.unitName || '',
                availableUnits,
                price,
                purchasePrice: product.purchasePrice || 0,
                quantity: 1,
            };
            return calcRowTotals(updated, vatType, taxMode);
        }));

        // Add new empty line if this was the last one
        setLines(prev => {
            if (prev[prev.length - 1].id === lineId) {
                return [...prev, emptyLine()];
            }
            return prev;
        });
    }, [rateType, vatType, taxMode, calcRowTotals, emptyLine]);

    // API Loaders & Action Handlers
    const loadNextInvoiceNo = useCallback(async () => {
        if (!companyId || !financialYearId) return;
        try {
            const res = await api.getNextNo(companyId, financialYearId);
            setInvoiceNo(res.data.data.invoiceNo);
        } catch { }
    }, [api, companyId, financialYearId]);

    const handleClear = useCallback(() => {
        setInvoiceId(null);
        loadNextInvoiceNo();
        setLines([emptyLine()]);
        setOtherDiscount(0);
        setOtherCharges(0);
        setFreightCharge(0);
        setRoundOff(0);
        setIsSaved(false);
        setCustomerId(null);
        setCustomerName('CASH');
    }, [loadNextInvoiceNo, emptyLine]);

    // Load Initial Data
    useEffect(() => {
        if (companyId) {
            productApi.list(companyId, { limit: 10000 }).then(res => setProducts((res.data as any).data.products || []));
            ledgerAccountApi.list(companyId, 'Customer').then(res => {
                const list = res.data.data as Customer[];
                setCustomers([{ _id: 'cash', name: 'CASH', code: 'CASH' } as Customer, ...list]);
            });
            if (financialYearId) {
                loadNextInvoiceNo();
                api.list(companyId, financialYearId).then(res => {
                    const items = res.data.data.invoices || res.data.data;
                    if (Array.isArray(items)) setInvoiceIds(items.map((i: any) => i._id));
                });
            }
        }
    }, [companyId, financialYearId, api, loadNextInvoiceNo]);

    return {
        state: {
            invoiceNo, setInvoiceNo, invoiceId, date, setDate, vatType, setVatType, taxMode, setTaxMode,
            paymentType, setPaymentType, rateType, setRateType, location, setLocation, customerId, setCustomerId, customerName, setCustomerName,
            customerAddress, setCustomerAddress, customers, setCustomers,
            billingAddress, setBillingAddress, billingPhone, setBillingPhone, shippingName, setShippingName, shippingAddress, setShippingAddress, shippingPhone, setShippingPhone,
            otherDiscount, setOtherDiscount, otherDiscPercent, setOtherDiscPercent, otherCharges, setOtherCharges,
            freightCharge, setFreightCharge, roundOff, setRoundOff, narration, setNarration, cashReceived, setCashReceived,
            oldBalance, setOldBalance, products, setProducts, lines, setLines, invoiceIds, setInvoiceIds, loading, setLoading, isSaved, setIsSaved, activeLineId, setActiveLineId, returnType, setReturnType,
            errorDialogOpen, setErrorDialogOpen, errorDialogMessage, setErrorDialogMessage,
        },
        helpers: {
            updateLine, handleProductSelect, handleClear, updateGrandTotals, removeLine: (id: string) => setLines(prev => prev.filter(l => l.id !== id)),
        },
        navigation: {
            handleFirst: () => { }, // To be implemented
            handlePrev: () => { },
            handleNext: () => { },
            handleLast: () => { },
        },
        context: { companyId, financialYearId, navigate }
    };
}
