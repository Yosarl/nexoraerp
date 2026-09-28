import mongoose from 'mongoose';
import { SalesInvoice } from '../models/SalesInvoice';
import { SalesInvoiceItem } from '../models/SalesInvoiceItem';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { Product } from '../models/Product';
import { Company } from '../models/Company';
import { LedgerAccount } from '../models/LedgerAccount';
import { LedgerGroup } from '../models/LedgerGroup';
import { Voucher } from '../models/Voucher';
import { AppError } from '../middlewares/errorHandler';
import * as ledgerService from './ledgerService';
import * as voucherService from './voucherService';
import * as billReferenceService from './billReferenceService';

/**
 * Find or auto-create a LedgerGroup by type.
 */
async function findOrCreateGroup(companyId: string, type: string) {
  let group = await LedgerGroup.findOne({ companyId, type });
  if (group) return group;
  const lastGrp = await LedgerGroup.findOne({ companyId, code: /^GRP/ }).sort({ code: -1 }).lean();
  const num = lastGrp?.code ? parseInt(lastGrp.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `GRP${num.toString().padStart(4, '0')}`;
  group = await LedgerGroup.create({ companyId, name: `${type} Group`, code, type });
  console.log(`[Auto-created] ${type} Group: ${code}`);
  return group;
}

/**
 * Find or auto-create the "Sales Account" ledger.
 */
async function findOrCreateSalesLedger(companyId: string) {
  let ledger = await LedgerAccount.findOne({ companyId, name: 'Sales Account' });
  if (ledger) return ledger;
  // Match exact "Sales" or "Sales Account" only (not "Sales Returns" etc.)
  ledger = await LedgerAccount.findOne({ companyId, name: /^sales\s*account$/i });
  if (ledger) return ledger;
  ledger = await LedgerAccount.findOne({ companyId, type: 'Revenue', name: /^sales$/i });
  if (ledger) return ledger;
  // Auto-create
  const group = await findOrCreateGroup(companyId, 'Income');
  const lastAcc = await LedgerAccount.findOne({ companyId, code: /^ACC/ }).sort({ code: -1 }).lean();
  const num = lastAcc?.code ? parseInt(lastAcc.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `ACC${num.toString().padStart(4, '0')}`;
  ledger = await LedgerAccount.create({
    companyId, name: 'Sales Account', code, type: 'Revenue',
    groupId: group._id,
  });
  console.log(`[Auto-created] Sales Account ledger: ${code}`);
  return ledger;
}

/**
 * Find or auto-create the "VAT Payable" ledger.
 */
async function findOrCreateVatLedger(companyId: string) {
  let ledger = await LedgerAccount.findOne({ companyId, name: 'VAT Payable' });
  if (ledger) return ledger;
  // Match "VAT Payable" or "VAT Output" only (not "VAT Input" / "VAT Receivable" etc.)
  ledger = await LedgerAccount.findOne({ companyId, name: /^vat\s*(payable|output)$/i });
  if (ledger) return ledger;
  // Auto-create
  let group = await LedgerGroup.findOne({ companyId, name: /duties and taxes payable/i, parentGroupId: { $ne: null } });
  if (!group) {
    group = await LedgerGroup.findOne({ companyId, name: /duties and taxes payable/i });
  }
  if (!group) {
    group = await findOrCreateGroup(companyId, 'Liability');
  }
  const lastAcc = await LedgerAccount.findOne({ companyId, code: /^ACC/ }).sort({ code: -1 }).lean();
  const num = lastAcc?.code ? parseInt(lastAcc.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `ACC${num.toString().padStart(4, '0')}`;
  ledger = await LedgerAccount.create({
    companyId, name: 'VAT Payable', code, type: 'Other',
    groupId: group._id,
  });
  console.log(`[Auto-created] VAT Payable ledger: ${code}`);
  return ledger;
}

/**
 * Generic helper: find or auto-create a ledger account by exact name.
 */
async function findOrCreateSpecialLedger(
  companyId: string,
  name: string,
  type: 'Revenue' | 'Expense' | 'Other',
  groupType: string,
) {
  let ledger = await LedgerAccount.findOne({ companyId, name });
  if (ledger) return ledger;
  // Case-insensitive fallback
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  ledger = await LedgerAccount.findOne({ companyId, name: new RegExp(`^${escaped}$`, 'i') });
  if (ledger) return ledger;
  // Auto-create
  const group = await findOrCreateGroup(companyId, groupType);
  const lastAcc = await LedgerAccount.findOne({ companyId, code: /^ACC/ }).sort({ code: -1 }).lean();
  const num = lastAcc?.code ? parseInt(lastAcc.code.replace(/\D/g, ''), 10) + 1 : 1;
  const code = `ACC${num.toString().padStart(4, '0')}`;
  ledger = await LedgerAccount.create({ companyId, name, code, type, groupId: group._id });
  console.log(`[Auto-created] ${name} ledger: ${code}`);
  return ledger;
}

export interface POSLineItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  vatRate?: number;
}

export interface POSPayment {
  mode: string;
  amount: number;
  reference?: string;
}

export interface CreatePOSSaleInput {
  companyId: string;
  financialYearId: string;
  items: POSLineItem[];
  billDiscount?: number;
  paymentDetails: POSPayment[];
  customerId?: string;
  customerName?: string;
  customerTRN?: string;
  createdBy?: string;
}

function getVatRate(vatCategory: string, companyVatRate: number): number {
  if (vatCategory === 'exempt' || vatCategory === 'zero') return 0;
  return companyVatRate;
}

export async function getNextInvoiceNo(
  companyId: string,
  financialYearId: string,
  type: string
): Promise<string> {
  const prefix = 'INV';
  const last = await SalesInvoice.findOne({ companyId, financialYearId, type })
    .sort({ invoiceNo: -1 })
    .lean();
  if (!last?.invoiceNo) return `${prefix}-000001`;
  // Extract only the numeric part after the dash
  const match = last.invoiceNo.match(/-(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${num.toString().padStart(6, '0')}`;
}

export async function createPOSSale(input: CreatePOSSaleInput): Promise<{ invoiceId: string; invoiceNo: string }> {
  const company = await Company.findById(input.companyId);
  if (!company) throw new AppError('Company not found', 404);
  const vatRatePct = company.vatConfig?.standardRate ?? 5;
  const date = new Date();

  let grossAmount = 0;
  let discountAmount = input.billDiscount ?? 0;
  const lineItems: Array<{
    productId: mongoose.Types.ObjectId;
    description: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    netAmount: number;
    vatRate: number;
    vatAmount: number;
    totalAmount: number;
    costPriceAtSale: number;
  }> = [];

  for (const item of input.items) {
    const product = await Product.findById(item.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${item.productId}`, 404);
    }
    const lineDiscount = item.discount ?? 0;
    const netBeforeVat = item.quantity * item.unitPrice - lineDiscount;
    const vatRate = (item.vatRate ?? getVatRate(product.vatCategory, vatRatePct)) / 100;
    const vatAmount = netBeforeVat * vatRate;
    const totalAmount = netBeforeVat + vatAmount;
    grossAmount += item.quantity * item.unitPrice;
    discountAmount += lineDiscount;
    lineItems.push({
      productId: product._id,
      description: product.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: lineDiscount,
      netAmount: netBeforeVat,
      vatRate: vatRate * 100,
      vatAmount,
      totalAmount,
      costPriceAtSale: product.purchasePrice ?? 0,
    });
  }

  const taxableAmount = grossAmount - discountAmount;
  const vatAmount = lineItems.reduce((s, l) => s + l.vatAmount, 0);
  const totalAmount = taxableAmount + vatAmount;

  const invoiceNo = await getNextInvoiceNo(
    input.companyId,
    input.financialYearId,
    'POS'
  );

  const invoice = await SalesInvoice.create({
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    invoiceNo,
    date,
    time: date.toTimeString().slice(0, 8),
    type: 'POS',
    customerId: input.customerId,
    customerName: input.customerName ?? 'Walk-in',
    customerTRN: input.customerTRN,
    grossAmount,
    discountAmount,
    taxableAmount,
    vatAmount,
    totalAmount,
    paymentDetails: input.paymentDetails,
    status: 'Final',
    createdBy: input.createdBy,
  });

  for (const line of lineItems) {
    await SalesInvoiceItem.create({
      invoiceId: invoice._id,
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      netAmount: line.netAmount,
      vatRate: line.vatRate,
      vatAmount: line.vatAmount,
      totalAmount: line.totalAmount,
      costPriceAtSale: line.costPriceAtSale,
    });
  }

  const cashLedger = await LedgerAccount.findOne({
    companyId: input.companyId,
    type: 'Cash',
  });
  const salesLedger = await findOrCreateSalesLedger(input.companyId);
  const vatLedger = await findOrCreateVatLedger(input.companyId);

  const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];
  if (cashLedger) {
    voucherLines.push({
      ledgerAccountId: cashLedger._id.toString(),
      debitAmount: totalAmount,
      creditAmount: 0,
      narration: `POS ${invoiceNo}`,
    });
  }
  if (salesLedger) {
    const salesCredit = vatLedger && vatAmount > 0 ? taxableAmount : totalAmount - (vatAmount || 0);
    voucherLines.push({
      ledgerAccountId: salesLedger._id.toString(),
      debitAmount: 0,
      creditAmount: salesCredit,
      narration: `POS ${invoiceNo}`,
    });
  }
  if (vatLedger && vatAmount > 0) {
    voucherLines.push({
      ledgerAccountId: vatLedger._id.toString(),
      debitAmount: 0,
      creditAmount: vatAmount,
      narration: `POS ${invoiceNo}`,
    });
  }

  if (voucherLines.length >= 2) {
    const totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = totalDebit - totalCredit;
    if (Math.abs(diff) > 0.01 && salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: diff > 0 ? 0 : Math.abs(diff),
        creditAmount: diff > 0 ? diff : 0,
        narration: 'Round',
      });
    }
    const v = await voucherService.createAndPost({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      voucherType: 'Sales',
      date,
      narration: `POS Sale ${invoiceNo}`,
      lines: voucherLines,
      referenceType: 'SalesInvoice',
      referenceId: invoice._id.toString(),
      referenceNo: invoiceNo,
      createdBy: input.createdBy,
    });
    await SalesInvoice.updateOne(
      { _id: invoice._id },
      { $set: { voucherId: v._id } }
    );
  }

  for (const line of lineItems) {
    await InventoryTransaction.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      productId: line.productId,
      date,
      type: 'Sales',
      quantityIn: 0,
      quantityOut: line.quantity,
      costPrice: line.costPriceAtSale,
      referenceType: 'SalesInvoice',
      referenceId: invoice._id,
      createdBy: input.createdBy,
    });
  }

  return {
    invoiceId: invoice._id.toString(),
    invoiceNo: invoice.invoiceNo,
  };
}

export async function getInvoice(invoiceId: string, companyId: string) {
  const invoice = await SalesInvoice.findOne({ _id: invoiceId, companyId })
    .populate('customerId', 'name code')
    .lean();
  if (!invoice) return null;
  const items = await SalesInvoiceItem.find({ invoiceId }).populate('productId', 'name sku systemBarcode code imei').lean();
  return { ...invoice, items };
}

// ==================== B2C Sales ====================

export interface B2CLineItem {
  productId: string;
  productCode?: string;
  imei?: string;
  multiUnitId?: string;
  unitId?: string;
  unitName?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discount?: number;
  vatRate?: number;
  batchNumber?: string;
}

export interface B2CPayment {
  mode: string;
  amount: number;
  reference?: string;
  accountId?: string;
}

export interface CreateB2CSaleInput {
  companyId: string;
  financialYearId: string;
  date?: string;
  type?: 'B2C' | 'B2B' | 'Quotation';
  items: B2CLineItem[];
  customerId?: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  salesmanId?: string;
  rateType?: 'Retail' | 'WSale' | 'Special1' | 'Special2';
  paymentType?: 'Cash' | 'Credit';
  vatType?: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  cashAccountId?: string;
  otherDiscount?: number;
  otherCharges?: number;
  freightCharge?: number;
  lendAddLess?: number;
  roundOff?: number;
  cashReceived?: number;
  oldBalance?: number;
  paymentDetails?: B2CPayment[];
  narration?: string;
  // Shipping Address
  shippingName?: string;
  shippingAddress?: string;
  shippingPhone?: string;
  shippingContactPerson?: string;
  createdBy?: string;
}

export async function getNextB2CInvoiceNo(companyId: string, financialYearId: string, type: 'B2C' | 'B2B' | 'Quotation' = 'B2C'): Promise<string> {
  const prefix = type === 'Quotation' ? 'QTN' : type;
  const last = await SalesInvoice.findOne({ companyId, financialYearId, type })
    .sort({ invoiceNo: -1 })
    .lean();
  if (!last?.invoiceNo) return `${prefix}-000001`;
  // Extract only the numeric part after the dash
  const match = last.invoiceNo.match(/-(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${num.toString().padStart(6, '0')}`;
}

export async function createB2CSale(input: CreateB2CSaleInput): Promise<{ invoiceId: string; invoiceNo: string }> {
  const company = await Company.findById(input.companyId);
  if (!company) throw new AppError('Company not found', 404);

  const vatRatePct = input.vatType === 'NonVat' ? 0 : (company.vatConfig?.standardRate ?? 5);
  const saleDate = input.date ? new Date(input.date) : new Date();

  let itemsGross = 0;
  let itemsDiscount = 0;
  let itemsVat = 0;

  const lineItems: Array<{
    productId: mongoose.Types.ObjectId;
    productCode: string;
    imei: string;
    multiUnitId?: string;
    unitId?: string;
    unitName?: string;
    description: string;
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
  }> = [];

  // Track cumulative stock consumed per product across all line items in this invoice
  const usedStockMap = new Map<string, number>();

  for (const item of input.items) {
    const product = await Product.findById(item.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${item.productId}`, 404);
    }

    if (input.type !== 'Quotation') {
      // Check available stock before allowing sale
      const pid = product._id.toString();
      const stockAgg = await InventoryTransaction.aggregate([
        {
          $match: {
            companyId: new mongoose.Types.ObjectId(input.companyId),
            productId: product._id,
          },
        },
        {
          $group: {
            _id: null,
            totalIn: { $sum: '$quantityIn' },
            totalOut: { $sum: '$quantityOut' },
          },
        },
      ]);
      const totalAvailable = stockAgg.length > 0 ? stockAgg[0].totalIn - stockAgg[0].totalOut : 0;
      const alreadyUsed = usedStockMap.get(pid) ?? 0;
      const remainingStock = totalAvailable - alreadyUsed;

      // For multi-unit sales, the actual stock consumed is qty * conversion
      let requiredStock = item.quantity;
      if (item.multiUnitId && product.multiUnits) {
        const mu = product.multiUnits.find((m) => m.multiUnitId === item.multiUnitId);
        if (mu && mu.conversion && mu.conversion > 0) {
          requiredStock = item.quantity * mu.conversion;
        }
      }

      if (remainingStock < requiredStock) {
        throw new AppError(
          `Insufficient stock for "${product.name}". Available: ${remainingStock}, Required: ${requiredStock}`,
          400
        );
      }

      // Track what this line consumes
      usedStockMap.set(pid, alreadyUsed + requiredStock);
    }

    const qty = item.quantity;
    const price = item.unitPrice;
    const gross = qty * price;
    const discPct = item.discountPercent ?? 0;
    const disc = item.discount ?? (gross * discPct / 100);
    const net = gross - disc;
    const vatRate = input.vatType === 'NonVat' ? 0 : (item.vatRate ?? vatRatePct);
    // Match frontend: inclusive = price includes VAT (extract VAT); exclusive = VAT on top
    const taxMode = input.taxMode ?? 'exclusive';
    let vatAmt: number;
    let total: number;
    if (input.vatType === 'Vat' && taxMode === 'inclusive' && vatRate > 0) {
      vatAmt = parseFloat((net * vatRate / (100 + vatRate)).toFixed(2));
      total = parseFloat(net.toFixed(2));
    } else {
      vatAmt = parseFloat((net * (vatRate / 100)).toFixed(2));
      total = parseFloat((net + vatAmt).toFixed(2));
    }

    itemsGross += gross;
    itemsDiscount += disc;
    itemsVat += vatAmt;

    lineItems.push({
      productId: product._id,
      productCode: item.productCode ?? product.code ?? '',
      imei: item.imei ?? product.imei ?? '',
      multiUnitId: item.multiUnitId,
      unitId: item.unitId,
      unitName: item.unitName,
      description: item.description ?? product.name,
      quantity: qty,
      unitPrice: price,
      grossAmount: gross,
      discountPercent: discPct,
      discount: disc,
      netAmount: net,
      vatRate,
      vatAmount: vatAmt,
      totalAmount: total,
      costPriceAtSale: product.purchasePrice ?? 0,
      batchNumber: item.batchNumber,
    });
  }

  const otherDiscount = input.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? 0;
  const lendAddLess = input.lendAddLess ?? 0;
  const roundOff = input.roundOff ?? 0;

  // When Vat: adjustments are inclusive of tax — total VAT includes VAT in adjustments; post net (VAT-excluded) to adjustment ledgers
  const isVat = input.vatType !== 'NonVat';
  const netAdjustments = otherCharges + freightCharge + lendAddLess + roundOff - otherDiscount;
  const vatFromAdjustments = isVat && netAdjustments !== 0
    ? parseFloat((netAdjustments * vatRatePct / (100 + vatRatePct)).toFixed(2))
    : 0;
  const totalVat = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));
  const netFactor = isVat ? 100 / (100 + vatRatePct) : 1;
  const otherDiscountNet = parseFloat((otherDiscount * netFactor).toFixed(2));
  const otherChargesNet = parseFloat((otherCharges * netFactor).toFixed(2));
  const freightChargeNet = parseFloat((freightCharge * netFactor).toFixed(2));
  const lendAddLessNet = parseFloat((lendAddLess * netFactor).toFixed(2));
  const roundOffNet = parseFloat((roundOff * netFactor).toFixed(2));

  const taxableAmount = itemsGross - itemsDiscount;
  // Inclusive: line total = net (amount includes VAT), so sum of line totals = taxableAmount. Exclusive: line total = net + vat, so subTotal = taxableAmount + itemsVat.
  const subTotal = (input.taxMode === 'inclusive' && isVat) ? taxableAmount : (taxableAmount + itemsVat);
  const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + lendAddLess + roundOff;

  const cashReceived = input.cashReceived ?? (input.paymentType === 'Cash' ? grandTotal : 0);
  const balance = grandTotal - cashReceived;
  const oldBalance = 0; // Could be fetched from customer account
  const netBalance = balance + oldBalance;

  const type = input.type || 'B2C';
  const invoiceNo = await getNextB2CInvoiceNo(input.companyId, input.financialYearId, type);

  // Create invoice, items, and inventory in a single flow with rollback on failure
  let invoice: { _id: mongoose.Types.ObjectId; invoiceNo: string } | null = null;
  try {
    const created = await SalesInvoice.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      invoiceNo,
      date: saleDate,
      time: saleDate.toTimeString().slice(0, 8),
      type,
      customerId: input.customerId,
      customerName: input.customerName ?? 'Walk-in',
      customerAddress: input.customerAddress,
      customerPhone: input.customerPhone,
      salesmanId: input.salesmanId,
      rateType: input.rateType ?? 'Retail',
      paymentType: input.paymentType ?? 'Cash',
      vatType: input.vatType ?? 'Vat',
      cashAccountId: input.cashAccountId,
      grossAmount: itemsGross,
      discountAmount: itemsDiscount,
      taxableAmount,
      vatAmount: totalVat,
      otherDiscount,
      otherCharges,
      freightCharge,
      lendAddLess,
      roundOff,
      totalAmount: grandTotal,
      cashReceived,
      balance,
      oldBalance,
      netBalance,
      paymentDetails: input.paymentDetails ?? [],
      narration: input.narration,
      // Shipping Address
      shippingName: input.shippingName,
      shippingAddress: input.shippingAddress,
      shippingPhone: input.shippingPhone,
      shippingContactPerson: input.shippingContactPerson,
      status: 'Final',
      createdBy: input.createdBy,
    });
    invoice = { _id: created._id, invoiceNo: created.invoiceNo };

    for (const line of lineItems) {
      await SalesInvoiceItem.create({
        invoiceId: invoice._id,
        productId: line.productId,
        productCode: line.productCode,
        imei: line.imei,
        multiUnitId: line.multiUnitId,
        unitId: line.unitId,
        unitName: line.unitName,
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        grossAmount: line.grossAmount,
        discountPercent: line.discountPercent,
        discount: line.discount,
        netAmount: line.netAmount,
        vatRate: line.vatRate,
        vatAmount: line.vatAmount,
        totalAmount: line.totalAmount,
        costPriceAtSale: line.costPriceAtSale,
        batchNumber: line.batchNumber,
      });
    }

    // Create inventory transactions
    if (input.type !== 'Quotation') {
      for (const line of lineItems) {
        // For multi-unit sales, reduce stock by conversion (pcs inside) instead of line qty
        let stockQtyOut = line.quantity;
        if (line.multiUnitId) {
          const prod = await Product.findById(line.productId).lean();
          if (prod && prod.multiUnits) {
            const mu = prod.multiUnits.find((m) => m.multiUnitId === line.multiUnitId);
            if (mu && mu.conversion && mu.conversion > 0) {
              stockQtyOut = line.quantity * mu.conversion;
            }
          }
        }

        await InventoryTransaction.create({
          companyId: input.companyId,
          financialYearId: input.financialYearId,
          productId: line.productId,
          date: saleDate,
          type: 'Sales',
          quantityIn: 0,
          quantityOut: stockQtyOut,
          costPrice: line.costPriceAtSale,
          referenceType: 'SalesInvoice',
          referenceId: invoice._id,
          batchNumber: line.batchNumber || undefined,
          createdBy: input.createdBy,
        });
      }
    }
  } catch (err) {
    // Rollback: clean up any partially created records
    if (invoice) {
      await SalesInvoiceItem.deleteMany({ invoiceId: invoice._id }).catch(() => { });
      await InventoryTransaction.deleteMany({ referenceId: invoice._id, referenceType: 'SalesInvoice' }).catch(() => { });
      await SalesInvoice.deleteOne({ _id: invoice._id }).catch(() => { });
    }
    throw err;
  }

  if (input.type === 'Quotation') {
    return {
      invoiceId: invoice!._id.toString(),
      invoiceNo: invoice!.invoiceNo,
    };
  }

  // ── Create accounting entries ─────────────────────────────────────
  console.log(`[B2C ${invoiceNo}] Accounting: itemsGross=${itemsGross}, itemsDiscount=${itemsDiscount}, itemsVat=${itemsVat}, totalVat=${totalVat}, otherDiscount=${otherDiscount}, otherCharges=${otherCharges}, freightCharge=${freightCharge}, lendAddLess=${lendAddLess}, roundOff=${roundOff}, grandTotal=${grandTotal}`);

  const cashLedger = input.cashAccountId
    ? await LedgerAccount.findById(input.cashAccountId)
    : await LedgerAccount.findOne({ companyId: input.companyId, type: 'Cash' });

  const salesLedger = await findOrCreateSalesLedger(input.companyId);
  const vatLedger = await findOrCreateVatLedger(input.companyId);
  const customerLedger = input.customerId ? await LedgerAccount.findById(input.customerId) : null;
  const cardTotal = (input.paymentDetails ?? []).reduce((s, pd) => s + (pd.amount || 0), 0);

  // Look up special ledger accounts (only when the amount is non-zero)
  const discountOnSalesLedger = itemsDiscount > 0
    ? await findOrCreateSpecialLedger(input.companyId, 'Discount on Sales', 'Expense', 'Expense') : null;
  const otherDiscountLedger = otherDiscount > 0
    ? await findOrCreateSpecialLedger(input.companyId, 'Other Discount on Sales', 'Expense', 'Expense') : null;
  const otherChargesLedger = otherCharges > 0
    ? await findOrCreateSpecialLedger(input.companyId, 'Other Charges on Sales', 'Revenue', 'Income') : null;
  const freightChargesLedger = freightCharge > 0
    ? await findOrCreateSpecialLedger(input.companyId, 'Freight Charges on Sales', 'Revenue', 'Income') : null;
  const travelChargesLedger = lendAddLess > 0
    ? await findOrCreateSpecialLedger(input.companyId, 'Travel Charges on Sales', 'Revenue', 'Income') : null;
  const roundOffLedger = Math.abs(roundOff) > 0.001
    ? await findOrCreateSpecialLedger(input.companyId, 'Round Off on Sales', 'Expense', 'Expense') : null;

  const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];

  /** Helper: push the shared credit/debit lines for discounts, charges, round-off */
  const pushSpecialLines = () => {
    // Debit: Discount on Sales (sum of all row-level discounts)
    if (discountOnSalesLedger && itemsDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: discountOnSalesLedger._id.toString(),
        debitAmount: itemsDiscount,
        creditAmount: 0,
        narration: `B2C ${invoiceNo} - Row Discounts`,
      });
    }
    // Debit: Other Discount on Sales (net = VAT-excluded when Vat)
    if (otherDiscountLedger && otherDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: otherDiscountLedger._id.toString(),
        debitAmount: otherDiscountNet,
        creditAmount: 0,
        narration: `B2C ${invoiceNo} - Other Discount`,
      });
    }
    // Credit: Other Charges on Sales (net when Vat)
    if (otherChargesLedger && otherCharges > 0) {
      voucherLines.push({
        ledgerAccountId: otherChargesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: otherChargesNet,
        narration: `B2C ${invoiceNo} - Other Charges`,
      });
    }
    // Credit: Freight Charges on Sales (net when Vat)
    if (freightChargesLedger && freightCharge > 0) {
      voucherLines.push({
        ledgerAccountId: freightChargesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: freightChargeNet,
        narration: `B2C ${invoiceNo} - Freight Charges`,
      });
    }
    // Credit: Travel Charges on Sales (net when Vat)
    if (travelChargesLedger && lendAddLess > 0) {
      voucherLines.push({
        ledgerAccountId: travelChargesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: lendAddLessNet,
        narration: `B2C ${invoiceNo} - Travel Charges`,
      });
    }
    // Round Off on Sales (net when Vat; debit if negative, credit if positive)
    if (roundOffLedger && Math.abs(roundOff) > 0.001) {
      voucherLines.push({
        ledgerAccountId: roundOffLedger._id.toString(),
        debitAmount: roundOffNet < 0 ? Math.abs(roundOffNet) : 0,
        creditAmount: roundOffNet > 0 ? roundOffNet : 0,
        narration: `B2C ${invoiceNo} - Round Off`,
      });
    }
  };

  const hasCustomerAc = !!customerLedger;
  const isCashPayment = input.paymentType !== 'Credit';

  if (hasCustomerAc) {
    // ── Customer A/C selected ──
    // Step 1: Debit Customer A/C with Grand Total (record sale to customer)
    voucherLines.push({
      ledgerAccountId: customerLedger!._id.toString(),
      debitAmount: grandTotal,
      creditAmount: 0,
      narration: `B2C ${invoiceNo} - Sale`,
    });

    // Credit: Sales A/C with GROSS amount (before discounts)
    if (salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: itemsGross,
        narration: `B2C ${invoiceNo}`,
      });
    }

    // Credit: VAT A/C (total output VAT = items + VAT in adjustments when Vat)
    if (vatLedger && totalVat > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: 0,
        creditAmount: totalVat,
        narration: `B2C ${invoiceNo}`,
      });
    }

    // Discount, Charges & Round-off entries (net amounts when Vat)
    pushSpecialLines();

    if (isCashPayment) {
      // Step 2: Payment entries — settle customer account
      // Card payment: Debit Card A/C, Credit Customer A/C
      if (input.paymentDetails && input.paymentDetails.length > 0) {
        for (const pd of input.paymentDetails) {
          if (pd.amount > 0 && pd.accountId) {
            voucherLines.push({
              ledgerAccountId: pd.accountId,
              debitAmount: pd.amount,
              creditAmount: 0,
              narration: `B2C ${invoiceNo} - ${pd.mode} Payment`,
            });
            voucherLines.push({
              ledgerAccountId: customerLedger!._id.toString(),
              debitAmount: 0,
              creditAmount: pd.amount,
              narration: `B2C ${invoiceNo} - ${pd.mode} Payment`,
            });
          }
        }
      }

      // Cash payment: Debit Cash A/C, Credit Customer A/C with remaining amount
      const cashPayment = grandTotal - cardTotal;
      if (cashLedger && cashPayment > 0) {
        voucherLines.push({
          ledgerAccountId: cashLedger._id.toString(),
          debitAmount: cashPayment,
          creditAmount: 0,
          narration: `B2C ${invoiceNo} - Cash Payment`,
        });
        voucherLines.push({
          ledgerAccountId: customerLedger!._id.toString(),
          debitAmount: 0,
          creditAmount: cashPayment,
          narration: `B2C ${invoiceNo} - Cash Payment`,
        });
      }
    }
    // If Credit payment: no payment entries — balance stays in customer A/C
  } else {
    // ── CASH customer (no customer A/C) ──
    // Debit: Cash A/C for cash portion
    const cashPortion = grandTotal - cardTotal;
    if (cashLedger && cashPortion > 0) {
      voucherLines.push({
        ledgerAccountId: cashLedger._id.toString(),
        debitAmount: cashPortion,
        creditAmount: 0,
        narration: `B2C ${invoiceNo}`,
      });
    }

    // Debit: Card A/C for card payment
    if (input.paymentDetails && input.paymentDetails.length > 0) {
      for (const pd of input.paymentDetails) {
        if (pd.amount > 0 && pd.accountId) {
          voucherLines.push({
            ledgerAccountId: pd.accountId,
            debitAmount: pd.amount,
            creditAmount: 0,
            narration: `B2C ${invoiceNo} - ${pd.mode}`,
          });
        }
      }
    }

    // Credit: Sales A/C with GROSS amount (before discounts)
    if (salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: itemsGross,
        narration: `B2C ${invoiceNo}`,
      });
    }

    // Credit: VAT A/C (total output VAT = items + VAT in adjustments when Vat)
    if (vatLedger && totalVat > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: 0,
        creditAmount: totalVat,
        narration: `B2C ${invoiceNo}`,
      });
    }

    // Discount, Charges & Round-off entries (net amounts when Vat)
    pushSpecialLines();
  }

  console.log(`[B2C ${invoiceNo}] Voucher lines (${voucherLines.length}):`);
  voucherLines.forEach((vl, i) => {
    console.log(`  Line ${i + 1}: ledger=${vl.ledgerAccountId} DR=${vl.debitAmount} CR=${vl.creditAmount} | ${vl.narration}`);
  });

  if (voucherLines.length >= 2) {
    // Safety: adjust for floating-point rounding (should be near zero now)
    const totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = parseFloat((totalDebit - totalCredit).toFixed(2));
    console.log(`[B2C ${invoiceNo}] Total DR=${totalDebit.toFixed(2)}, CR=${totalCredit.toFixed(2)}, diff=${diff}`);
    if (Math.abs(diff) > 0.01 && salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: diff > 0 ? 0 : Math.abs(diff),
        creditAmount: diff > 0 ? diff : 0,
        narration: 'Rounding Adjustment',
      });
    }
    try {
      const v = await voucherService.createAndPost({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        voucherType: 'Sales',
        date: saleDate,
        narration: `B2C Sale ${invoiceNo}`,
        lines: voucherLines,
        referenceType: 'SalesInvoice',
        referenceId: invoice!._id.toString(),
        referenceNo: invoiceNo,
        createdBy: input.createdBy,
      });
      console.log(`[B2C ${invoiceNo}] Voucher created successfully: ${v.voucherNo}`);
      await SalesInvoice.updateOne({ _id: invoice!._id }, { $set: { voucherId: v._id } });
    } catch (e: unknown) {
      console.error(`[B2C ${invoiceNo}] Voucher creation FAILED:`, (e as Error).message || e);
    }
  } else {
    console.warn(`[B2C ${invoiceNo}] Insufficient voucher lines (${voucherLines.length}). Cash ledger: ${cashLedger ? 'found' : 'MISSING'}, Sales ledger: ${salesLedger ? 'found' : 'MISSING'}`);
  }

  // 5. Create bill reference ("New Ref" — receivable from customer)
  if (input.customerId && grandTotal > 0) {
    try {
      await billReferenceService.createNewRef({
        companyId: input.companyId,
        financialYearId: input.financialYearId,
        ledgerAccountId: input.customerId,
        billNumber: invoiceNo,
        referenceType: 'SalesInvoice',
        referenceId: invoice!._id.toString(),
        date: saleDate,
        amount: grandTotal,
        drCr: 'Dr',
        narration: `B2C Sale ${invoiceNo}`,
      });
    } catch (err) {
      console.error(`[B2C ${invoiceNo}] Bill reference creation failed:`, err);
    }
  }

  return {
    invoiceId: invoice!._id.toString(),
    invoiceNo: invoice!.invoiceNo,
  };
}

export async function updateB2CSale(
  invoiceId: string,
  companyId: string,
  input: Partial<CreateB2CSaleInput>,
  userId: string
): Promise<{ invoiceId: string; invoiceNo: string } | null> {
  const existing = await SalesInvoice.findOne({ _id: invoiceId, companyId, type: { $in: ['B2C', 'B2B', 'Quotation'] } });
  if (!existing) return null;

  // Recalculate with new data
  const company = await Company.findById(companyId);
  if (!company) throw new AppError('Company not found', 404);
  const vatRatePct = input.vatType === 'NonVat' ? 0 : (company.vatConfig?.standardRate ?? 5);
  const saleDate = input.date ? new Date(input.date) : existing.date;

  const items = input.items ?? [];

  // ── Step 1: Validate stock BEFORE deleting old data ──
  // Delete old inventory transactions first to free up stock, then check
  if (existing.type !== 'Quotation') {
    await InventoryTransaction.deleteMany({ referenceId: invoiceId, referenceType: 'SalesInvoice' });
  }

  const usedStockMap = new Map<string, number>();
  for (const item of items) {
    const product = await Product.findById(item.productId).lean();
    if (!product) throw new AppError(`Product not found: ${item.productId}`, 404);

    if (existing.type !== 'Quotation') {
      const pid = product._id.toString();
      let requiredStock = item.quantity;
      if (item.multiUnitId && product.multiUnits) {
        const mu = product.multiUnits.find((m) => m.multiUnitId === item.multiUnitId);
        if (mu && mu.conversion && mu.conversion > 0) {
          requiredStock = item.quantity * mu.conversion;
        }
      }

      // Check available stock (old transactions already deleted so stock is freed)
      const stockAgg = await InventoryTransaction.aggregate([
        { $match: { companyId: new mongoose.Types.ObjectId(companyId), productId: product._id } },
        { $group: { _id: null, totalIn: { $sum: '$quantityIn' }, totalOut: { $sum: '$quantityOut' } } },
      ]);
      const totalAvailable = stockAgg.length > 0 ? stockAgg[0].totalIn - stockAgg[0].totalOut : 0;
      const alreadyUsed = usedStockMap.get(pid) ?? 0;
      const remainingStock = totalAvailable - alreadyUsed;

      if (remainingStock < requiredStock) {
        // Restore old inventory transactions since validation failed
        // Re-create old items from DB — we haven't deleted SalesInvoiceItems yet
        throw new AppError(
          `Insufficient stock for "${product.name}". Available: ${remainingStock}, Required: ${requiredStock}`,
          400
        );
      }
      usedStockMap.set(pid, alreadyUsed + requiredStock);
    }
  }

  // ── Step 2: Now safe to delete old items and recreate ──
  await SalesInvoiceItem.deleteMany({ invoiceId });

  let itemsGross = 0, itemsDiscount = 0, itemsVat = 0;

  const taxModeUpdate = input.taxMode ?? 'exclusive';

  for (const item of items) {
    const product = await Product.findById(item.productId).lean();
    if (!product) continue;

    const qty = item.quantity;
    const price = item.unitPrice;
    const gross = qty * price;
    const discPct = item.discountPercent ?? 0;
    const disc = item.discount ?? (gross * discPct / 100);
    const net = gross - disc;
    const vatRate = input.vatType === 'NonVat' ? 0 : (item.vatRate ?? vatRatePct);
    let vatAmt: number;
    let total: number;
    if (input.vatType === 'Vat' && taxModeUpdate === 'inclusive' && vatRate > 0) {
      vatAmt = parseFloat((net * vatRate / (100 + vatRate)).toFixed(2));
      total = parseFloat(net.toFixed(2));
    } else {
      vatAmt = parseFloat((net * (vatRate / 100)).toFixed(2));
      total = parseFloat((net + vatAmt).toFixed(2));
    }

    itemsGross += gross;
    itemsDiscount += disc;
    itemsVat += vatAmt;

    await SalesInvoiceItem.create({
      invoiceId: existing._id,
      productId: product._id,
      productCode: item.productCode ?? product.code ?? '',
      imei: item.imei ?? product.imei ?? '',
      multiUnitId: item.multiUnitId,
      unitId: item.unitId,
      unitName: item.unitName,
      description: item.description ?? product.name,
      quantity: qty,
      unitPrice: price,
      grossAmount: gross,
      discountPercent: discPct,
      discount: disc,
      netAmount: net,
      vatRate,
      vatAmount: vatAmt,
      totalAmount: total,
      costPriceAtSale: product.purchasePrice ?? 0,
      batchNumber: item.batchNumber,
    });

    if (existing.type !== 'Quotation') {
      // For multi-unit sales, reduce stock by conversion (pcs inside) instead of line qty
      let stockQtyOut = qty;
      if (item.multiUnitId && product.multiUnits) {
        const mu = product.multiUnits.find((m) => m.multiUnitId === item.multiUnitId);
        if (mu && mu.conversion && mu.conversion > 0) {
          stockQtyOut = qty * mu.conversion;
        }
      }

      await InventoryTransaction.create({
        companyId,
        financialYearId: input.financialYearId ?? existing.financialYearId.toString(),
        productId: product._id,
        date: saleDate,
        type: 'Sales',
        quantityIn: 0,
        quantityOut: stockQtyOut,
        costPrice: product.purchasePrice ?? 0,
        referenceType: 'SalesInvoice',
        referenceId: existing._id,
        batchNumber: item.batchNumber || undefined,
        createdBy: userId,
      });
    }
  }

  const otherDiscount = input.otherDiscount ?? existing.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? existing.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? existing.freightCharge ?? 0;
  const lendAddLess = input.lendAddLess ?? existing.lendAddLess ?? 0;
  const roundOff = input.roundOff ?? existing.roundOff ?? 0;

  // When Vat: adjustments are inclusive — totalVat and net amounts for ledgers
  const isVatUpdate = input.vatType !== 'NonVat';
  const netAdjustmentsUpdate = otherCharges + freightCharge + lendAddLess + roundOff - otherDiscount;
  const vatFromAdjustmentsUpdate = isVatUpdate && netAdjustmentsUpdate !== 0
    ? parseFloat((netAdjustmentsUpdate * vatRatePct / (100 + vatRatePct)).toFixed(2))
    : 0;
  const totalVatUpdate = parseFloat((itemsVat + vatFromAdjustmentsUpdate).toFixed(2));
  const netFactorUpdate = isVatUpdate ? 100 / (100 + vatRatePct) : 1;
  const otherDiscountNetUpdate = parseFloat((otherDiscount * netFactorUpdate).toFixed(2));
  const otherChargesNetUpdate = parseFloat((otherCharges * netFactorUpdate).toFixed(2));
  const freightChargeNetUpdate = parseFloat((freightCharge * netFactorUpdate).toFixed(2));
  const lendAddLessNetUpdate = parseFloat((lendAddLess * netFactorUpdate).toFixed(2));
  const roundOffNetUpdate = parseFloat((roundOff * netFactorUpdate).toFixed(2));

  const taxableAmount = itemsGross - itemsDiscount;
  const subTotalUpdate = (input.taxMode === 'inclusive' && isVatUpdate) ? taxableAmount : (taxableAmount + itemsVat);
  const grandTotal = subTotalUpdate - otherDiscount + otherCharges + freightCharge + lendAddLess + roundOff;
  const cashReceived = input.cashReceived ?? (input.paymentType === 'Cash' ? grandTotal : 0);

  // Delete old voucher if exists
  if (existing.voucherId) {
    try {
      await Voucher.deleteOne({ _id: existing.voucherId });
      // Also delete ledger entries for the old voucher
      const { LedgerEntry } = await import('../models/LedgerEntry');
      await LedgerEntry.deleteMany({ voucherId: existing.voucherId });
    } catch {
      // ignore
    }
  }

  await SalesInvoice.updateOne(
    { _id: invoiceId },
    {
      $set: {
        date: saleDate,
        customerId: input.customerId,
        customerName: input.customerName,
        customerAddress: input.customerAddress,
        customerPhone: input.customerPhone,
        salesmanId: input.salesmanId,
        rateType: input.rateType,
        paymentType: input.paymentType,
        vatType: input.vatType,
        cashAccountId: input.cashAccountId,
        grossAmount: itemsGross,
        discountAmount: itemsDiscount,
        taxableAmount,
        vatAmount: totalVatUpdate,
        otherDiscount,
        otherCharges,
        freightCharge,
        lendAddLess,
        roundOff,
        totalAmount: grandTotal,
        cashReceived,
        balance: grandTotal - cashReceived,
        oldBalance: input.oldBalance ?? existing.oldBalance ?? 0,
        netBalance: grandTotal - cashReceived + (input.oldBalance ?? existing.oldBalance ?? 0),
        paymentDetails: input.paymentDetails,
        narration: input.narration,
        // Shipping details
        shippingName: input.shippingName,
        shippingAddress: input.shippingAddress,
        shippingPhone: input.shippingPhone,
        shippingContactPerson: input.shippingContactPerson,
        updatedBy: userId,
      },
    }
  );

  if (existing.type === 'Quotation') {
    return { invoiceId, invoiceNo: existing.invoiceNo };
  }

  // ── Recreate accounting entries (totalVat + net adjustment amounts when Vat) ─────────────────────────────────────
  const cashLedger = input.cashAccountId
    ? await LedgerAccount.findById(input.cashAccountId)
    : await LedgerAccount.findOne({ companyId, type: 'Cash' });
  const salesLedger = await findOrCreateSalesLedger(companyId);
  const vatLedger = await findOrCreateVatLedger(companyId);
  const customerLedger = input.customerId ? await LedgerAccount.findById(input.customerId) : null;
  const cardTotal = (input.paymentDetails ?? []).reduce((s, pd) => s + (pd.amount || 0), 0);

  // Look up special ledger accounts (only when the amount is non-zero)
  const discountOnSalesLedger2 = itemsDiscount > 0
    ? await findOrCreateSpecialLedger(companyId, 'Discount on Sales', 'Expense', 'Expense') : null;
  const otherDiscountLedger2 = otherDiscount > 0
    ? await findOrCreateSpecialLedger(companyId, 'Other Discount on Sales', 'Expense', 'Expense') : null;
  const otherChargesLedger2 = otherCharges > 0
    ? await findOrCreateSpecialLedger(companyId, 'Other Charges on Sales', 'Revenue', 'Income') : null;
  const freightChargesLedger2 = freightCharge > 0
    ? await findOrCreateSpecialLedger(companyId, 'Freight Charges on Sales', 'Revenue', 'Income') : null;
  const travelChargesLedger2 = lendAddLess > 0
    ? await findOrCreateSpecialLedger(companyId, 'Travel Charges on Sales', 'Revenue', 'Income') : null;
  const roundOffLedger2 = Math.abs(roundOff) > 0.001
    ? await findOrCreateSpecialLedger(companyId, 'Round Off on Sales', 'Expense', 'Expense') : null;

  const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];

  /** Helper: push the shared credit/debit lines for discounts, charges, round-off (net amounts when Vat) */
  const pushSpecialLines2 = () => {
    if (discountOnSalesLedger2 && itemsDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: discountOnSalesLedger2._id.toString(),
        debitAmount: itemsDiscount, creditAmount: 0,
        narration: `B2C ${invNo} - Row Discounts`,
      });
    }
    if (otherDiscountLedger2 && otherDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: otherDiscountLedger2._id.toString(),
        debitAmount: otherDiscountNetUpdate, creditAmount: 0,
        narration: `B2C ${invNo} - Other Discount`,
      });
    }
    if (otherChargesLedger2 && otherCharges > 0) {
      voucherLines.push({
        ledgerAccountId: otherChargesLedger2._id.toString(),
        debitAmount: 0, creditAmount: otherChargesNetUpdate,
        narration: `B2C ${invNo} - Other Charges`,
      });
    }
    if (freightChargesLedger2 && freightCharge > 0) {
      voucherLines.push({
        ledgerAccountId: freightChargesLedger2._id.toString(),
        debitAmount: 0, creditAmount: freightChargeNetUpdate,
        narration: `B2C ${invNo} - Freight Charges`,
      });
    }
    if (travelChargesLedger2 && lendAddLess > 0) {
      voucherLines.push({
        ledgerAccountId: travelChargesLedger2._id.toString(),
        debitAmount: 0, creditAmount: lendAddLessNetUpdate,
        narration: `B2C ${invNo} - Travel Charges`,
      });
    }
    if (roundOffLedger2 && Math.abs(roundOff) > 0.001) {
      voucherLines.push({
        ledgerAccountId: roundOffLedger2._id.toString(),
        debitAmount: roundOffNetUpdate < 0 ? Math.abs(roundOffNetUpdate) : 0,
        creditAmount: roundOffNetUpdate > 0 ? roundOffNetUpdate : 0,
        narration: `B2C ${invNo} - Round Off`,
      });
    }
  };

  const hasCustomerAc = !!customerLedger;
  const isCashPayment = input.paymentType !== 'Credit';
  const invNo = existing.invoiceNo;

  if (hasCustomerAc) {
    // ── Customer A/C selected ──
    voucherLines.push({
      ledgerAccountId: customerLedger!._id.toString(),
      debitAmount: grandTotal,
      creditAmount: 0,
      narration: `B2C ${invNo} - Sale`,
    });

    // Credit: Sales A/C with GROSS amount (before discounts)
    if (salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: itemsGross,
        narration: `B2C ${invNo}`,
      });
    }

    // Credit: VAT A/C (total output VAT when Vat)
    if (vatLedger && totalVatUpdate > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: 0,
        creditAmount: totalVatUpdate,
        narration: `B2C ${invNo}`,
      });
    }

    // Discount, Charges & Round-off entries (net when Vat)
    pushSpecialLines2();

    if (isCashPayment) {
      if (input.paymentDetails && input.paymentDetails.length > 0) {
        for (const pd of input.paymentDetails) {
          if (pd.amount > 0 && pd.accountId) {
            voucherLines.push({
              ledgerAccountId: pd.accountId,
              debitAmount: pd.amount,
              creditAmount: 0,
              narration: `B2C ${invNo} - ${pd.mode} Payment`,
            });
            voucherLines.push({
              ledgerAccountId: customerLedger!._id.toString(),
              debitAmount: 0,
              creditAmount: pd.amount,
              narration: `B2C ${invNo} - ${pd.mode} Payment`,
            });
          }
        }
      }

      const cashPayment = grandTotal - cardTotal;
      if (cashLedger && cashPayment > 0) {
        voucherLines.push({
          ledgerAccountId: cashLedger._id.toString(),
          debitAmount: cashPayment,
          creditAmount: 0,
          narration: `B2C ${invNo} - Cash Payment`,
        });
        voucherLines.push({
          ledgerAccountId: customerLedger!._id.toString(),
          debitAmount: 0,
          creditAmount: cashPayment,
          narration: `B2C ${invNo} - Cash Payment`,
        });
      }
    }
  } else {
    // ── CASH customer (no customer A/C) ──
    const cashPortion = grandTotal - cardTotal;
    if (cashLedger && cashPortion > 0) {
      voucherLines.push({
        ledgerAccountId: cashLedger._id.toString(),
        debitAmount: cashPortion,
        creditAmount: 0,
        narration: `B2C ${invNo}`,
      });
    }

    if (input.paymentDetails && input.paymentDetails.length > 0) {
      for (const pd of input.paymentDetails) {
        if (pd.amount > 0 && pd.accountId) {
          voucherLines.push({
            ledgerAccountId: pd.accountId,
            debitAmount: pd.amount,
            creditAmount: 0,
            narration: `B2C ${invNo} - ${pd.mode}`,
          });
        }
      }
    }

    // Credit: Sales A/C with GROSS amount (before discounts)
    if (salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: 0,
        creditAmount: itemsGross,
        narration: `B2C ${invNo}`,
      });
    }

    if (vatLedger && totalVatUpdate > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: 0,
        creditAmount: totalVatUpdate,
        narration: `B2C ${invNo}`,
      });
    }

    // Discount, Charges & Round-off entries (net when Vat)
    pushSpecialLines2();
  }

  if (voucherLines.length >= 2) {
    const totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    const totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = parseFloat((totalDebit - totalCredit).toFixed(2));
    if (Math.abs(diff) > 0.01 && salesLedger) {
      voucherLines.push({
        ledgerAccountId: salesLedger._id.toString(),
        debitAmount: diff > 0 ? 0 : Math.abs(diff),
        creditAmount: diff > 0 ? diff : 0,
        narration: 'Rounding Adjustment',
      });
    }
    try {
      const v = await voucherService.createAndPost({
        companyId,
        financialYearId: input.financialYearId ?? existing.financialYearId.toString(),
        voucherType: 'Sales',
        date: saleDate,
        narration: `B2C Sale ${invNo}`,
        lines: voucherLines,
        referenceType: 'SalesInvoice',
        referenceId: invoiceId,
        referenceNo: invNo,
        createdBy: userId,
      });
      await SalesInvoice.updateOne({ _id: invoiceId }, { $set: { voucherId: v._id } });
    } catch (e: unknown) {
      console.error(`[B2C ${invNo} update] Voucher creation failed:`, (e as Error).message || e);
    }
  } else {
    console.warn(`[B2C ${invNo} update] Insufficient voucher lines (${voucherLines.length}). Cash: ${cashLedger ? 'found' : 'MISSING'}, Sales: ${salesLedger ? 'found' : 'MISSING'}`);
  }

  // Update bill reference ("New Ref" — receivable from customer)
  if (input.customerId && grandTotal > 0) {
    try {
      await billReferenceService.createNewRef({
        companyId,
        financialYearId: input.financialYearId ?? existing.financialYearId.toString(),
        ledgerAccountId: input.customerId,
        billNumber: existing.invoiceNo,
        referenceType: 'SalesInvoice',
        referenceId: invoiceId,
        date: saleDate,
        amount: grandTotal,
        drCr: 'Dr',
        narration: `B2C Sale ${existing.invoiceNo} (updated)`,
      });
    } catch (err) {
      console.error(`[B2C ${invNo} update] Bill reference update failed:`, err);
    }
  }

  return { invoiceId, invoiceNo: existing.invoiceNo };
}

export async function deleteB2CSale(invoiceId: string, companyId: string): Promise<boolean> {
  const invoice = await SalesInvoice.findOne({ _id: invoiceId, companyId, type: { $in: ['B2C', 'B2B', 'Quotation'] } });
  if (!invoice) return false;

  // Delete line items
  await SalesInvoiceItem.deleteMany({ invoiceId });

  // Reverse inventory transactions
  await InventoryTransaction.deleteMany({ referenceId: invoiceId, referenceType: 'SalesInvoice' });

  // Reverse accounting entries - delete voucher and associated ledger entries
  if (invoice.voucherId) {
    try {
      const { LedgerEntry } = await import('../models/LedgerEntry');
      await LedgerEntry.deleteMany({ voucherId: invoice.voucherId });
      await Voucher.deleteOne({ _id: invoice.voucherId });
    } catch (e) {
      console.error(`[B2C Delete] Failed to reverse accounting entries for voucher ${invoice.voucherId}:`, (e as Error).message || e);
    }
  }

  // Delete bill references
  await billReferenceService.deleteRefsBySource('SalesInvoice', invoiceId);

  await SalesInvoice.deleteOne({ _id: invoiceId });

  return true;
}

export async function listB2CInvoices(
  companyId: string,
  financialYearId: string,
  opts: { search?: string; fromDate?: string; toDate?: string; page?: number; limit?: number; type?: 'B2C' | 'B2B' | 'Quotation' } = {}
) {
  const type = opts.type || 'B2C';
  const filter: Record<string, unknown> = { companyId, financialYearId, type };

  if (opts.search) {
    filter.$or = [
      { invoiceNo: new RegExp(opts.search, 'i') },
      { customerName: new RegExp(opts.search, 'i') },
    ];
  }
  if (opts.fromDate || opts.toDate) {
    filter.date = {};
    if (opts.fromDate) (filter.date as Record<string, Date>).$gte = new Date(opts.fromDate);
    if (opts.toDate) (filter.date as Record<string, Date>).$lte = new Date(opts.toDate);
  }

  const total = await SalesInvoice.countDocuments(filter);
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);

  const invoices = await SalesInvoice.find(filter)
    .populate('customerId', 'name code')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return { invoices, total };
}

export async function getB2CInvoice(
  invoiceId: string,
  companyId: string,
  type?: 'B2C' | 'B2B' | 'Quotation',
  excludeReturnId?: string
) {
  const filter: Record<string, any> = { _id: invoiceId, companyId };
  if (type) filter.type = type;
  else filter.type = { $in: ['B2C', 'B2B', 'Quotation'] };

  const invoice = await SalesInvoice.findOne(filter)
    .populate('customerId', 'name code address')
    .populate('salesmanId', 'username displayName')
    .populate('cashAccountId', 'name code')
    .lean();
  if (!invoice) return null;

  const items = await SalesInvoiceItem.find({ invoiceId })
    .populate({
      path: 'productId',
      select: 'name code imei sku retailPrice wholesalePrice purchasePrice unitOfMeasureId multiUnits',
      populate: [
        { path: 'unitOfMeasureId', select: 'name shortCode' },
        { path: 'multiUnits.unitId', select: 'name shortCode' }
      ]
    })
    .lean();

  const returnFilter: Record<string, any> = {
    companyId,
    type: 'Return',
    status: { $ne: 'Cancelled' },
    originalInvoiceId: invoice._id,
  };
  if (excludeReturnId) {
    returnFilter._id = { $ne: new mongoose.Types.ObjectId(excludeReturnId) };
  }
  const returns = await SalesInvoice.find(returnFilter).select('_id').lean();

  const returnedQuantities: Record<string, number> = {};
  if (returns.length > 0) {
    const returnIds = returns.map((r) => r._id);
    const returnItems = await SalesInvoiceItem.find({ invoiceId: { $in: returnIds } }).lean();
    for (const ri of returnItems) {
      const pId = ri.productId ? ri.productId.toString() : '';
      const key = `${pId}_${ri.batchNumber || ''}`;
      returnedQuantities[key] = (returnedQuantities[key] || 0) + (ri.quantity || 0);
    }
  }

  const remainingToAllocate = { ...returnedQuantities };
  const itemsWithReturned = items.map((it) => {
    const pId = typeof it.productId === 'object' && it.productId !== null
      ? (it.productId as any)._id.toString()
      : String(it.productId || '');
    const key = `${pId}_${it.batchNumber || ''}`;
    const totalReturnedForThisKey = remainingToAllocate[key] || 0;
    const allocatedToLine = Math.min(it.quantity || 0, totalReturnedForThisKey);
    if (remainingToAllocate[key] !== undefined) {
      remainingToAllocate[key] -= allocatedToLine;
    }
    return {
      ...it,
      returnedQuantity: allocatedToLine,
      remainingReturnableQuantity: Math.max(0, (it.quantity || 0) - allocatedToLine),
    };
  });

  return { ...invoice, items: itemsWithReturned };
}

export async function searchB2CByInvoiceNo(
  companyId: string,
  invoiceNo: string,
  type?: 'B2C' | 'B2B' | 'Quotation',
  excludeReturnId?: string
) {
  const filter: Record<string, any> = {
    companyId,
    invoiceNo: new RegExp(invoiceNo, 'i'),
  };
  if (type) filter.type = type;
  else filter.type = { $in: ['B2C', 'B2B', 'Quotation'] };

  const invoice = await SalesInvoice.findOne(filter).lean();
  if (!invoice) return null;
  return getB2CInvoice(invoice._id.toString(), companyId, invoice.type as 'B2C' | 'B2B' | 'Quotation', excludeReturnId);
}


/**
 * Get transaction history for a product sold to a specific customer.
 * Returns all B2C invoice items for the given product + customer.
 */
export async function getProductCustomerHistory(
  companyId: string,
  productId: string,
  customerId?: string,
  type?: 'POS' | 'B2C' | 'B2B' | 'Quotation'
) {
  const productObjId = new mongoose.Types.ObjectId(productId);

  // Build the SALES invoice filter (purchases)
  const salesFilter: Record<string, any> = {
    companyId,
    type: type || { $in: ['POS', 'B2C', 'B2B', 'Quotation'] },
    status: { $ne: 'Cancelled' },
  };

  // Build the RETURN invoice filter (previous returns by this customer)
  const returnFilter: Record<string, any> = {
    companyId,
    type: 'Return',
    status: { $ne: 'Cancelled' },
  };

  if (customerId) {
    let isCashAccount = false;
    if (customerId === 'cash') {
      isCashAccount = true;
    } else if (mongoose.Types.ObjectId.isValid(customerId)) {
      const account = await LedgerAccount.findById(customerId).lean();
      if (account && (account.type === 'Cash' || account.type === 'Bank' || account.name.toLowerCase() === 'cash' || account.code.toLowerCase() === 'cash')) {
        isCashAccount = true;
      }
    }

    if (isCashAccount) {
      const cashConditions = [
        { cashAccountId: new mongoose.Types.ObjectId(customerId) },
        { paymentType: 'Cash', customerId: null },
        { paymentType: 'Cash', customerId: { $exists: false } }
      ];
      salesFilter.$or = cashConditions;
      returnFilter.$or = cashConditions;
    } else {
      salesFilter.customerId = new mongoose.Types.ObjectId(customerId);
      returnFilter.customerId = new mongoose.Types.ObjectId(customerId);
    }
  }

  // Query sales invoices and return invoices in parallel
  const [salesInvoices, returnInvoices] = await Promise.all([
    SalesInvoice.find(salesFilter)
      .select('_id invoiceNo date customerName totalAmount')
      .sort({ date: -1, createdAt: -1 })
      .lean(),
    SalesInvoice.find(returnFilter)
      .select('_id')
      .lean(),
  ]);

  // ── Calculate totalPurchased ──
  let totalPurchased = 0;
  let history: Array<{
    invoiceNo: string; date: string | Date; customerName: string;
    quantity: number; unitPrice: number; unitName: string;
    discount: number; total: number; batchNumber: string;
  }> = [];

  if (salesInvoices.length > 0) {
    const salesIds = salesInvoices.map((inv) => inv._id);
    const salesItems = await SalesInvoiceItem.find({
      invoiceId: { $in: salesIds },
      productId: productObjId,
    }).lean();

    totalPurchased = salesItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

    const invoiceMap = new Map(salesInvoices.map((inv) => [inv._id.toString(), inv]));
    history = salesItems.map((item) => {
      const inv = invoiceMap.get(item.invoiceId.toString());
      return {
        invoiceNo: inv?.invoiceNo || '',
        date: inv?.date || '',
        customerName: inv?.customerName || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        unitName: item.unitName || '',
        discount: item.discount,
        total: item.totalAmount,
        batchNumber: item.batchNumber || '',
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // ── Calculate totalReturned (from previous return invoices) ──
  let totalReturned = 0;
  if (returnInvoices.length > 0) {
    const returnIds = returnInvoices.map((inv) => inv._id);
    const returnItems = await SalesInvoiceItem.find({
      invoiceId: { $in: returnIds },
      productId: productObjId,
    }).lean();

    totalReturned = returnItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }

  const netReturnable = Math.max(0, totalPurchased - totalReturned);

  return {
    history: history.slice(0, 20), // return recent history for display (increased from 5)
    totalPurchased,
    totalReturned,
    netReturnable,
  };
}

// ─── Sales Return ────────────────────────────────────────────────────

export type SalesReturnType = 'OnAccount' | 'ByRef';

export interface SalesReturnLineItem {
  productId: string;
  productCode?: string;
  imei?: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  discount?: number;
  unitId?: string;
  unitName?: string;
  multiUnitId?: string;
  batchNumber?: string;
}

export interface CreateSalesReturnInput {
  companyId: string;
  financialYearId: string;
  date?: string;
  returnType: SalesReturnType;
  originalInvoiceId?: string; // required when returnType === 'ByRef'
  customerId?: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  cashAccountId?: string; // for cash refund
  vatType?: 'Vat' | 'NonVat';
  taxMode?: 'inclusive' | 'exclusive';
  items: SalesReturnLineItem[];
  otherDiscount?: number;
  otherCharges?: number;
  freightCharge?: number;
  lendAddLess?: number;
  roundOff?: number;
  narration?: string;
  createdBy?: string;
}

export async function getNextReturnInvoiceNo(companyId: string, financialYearId: string): Promise<string> {
  const prefix = 'SR';
  const last = await SalesInvoice.findOne({ companyId, financialYearId, type: 'Return' })
    .sort({ invoiceNo: -1 })
    .lean();
  if (!last?.invoiceNo) return `${prefix}-000001`;
  const match = last.invoiceNo.match(/-(\d+)$/);
  const num = match ? parseInt(match[1], 10) + 1 : 1;
  return `${prefix}-${num.toString().padStart(6, '0')}`;
}

export async function listSalesReturns(companyId: string, financialYearId: string) {
  const invoices = await SalesInvoice.find({ companyId, financialYearId, type: 'Return' })
    .sort({ date: 1, createdAt: 1 })
    .limit(500)
    .lean();
  return invoices.map((inv) => ({
    _id: inv._id.toString(),
    invoiceNo: inv.invoiceNo,
    date: inv.date,
    customerName: inv.customerName,
    totalAmount: inv.totalAmount,
  }));
}

export async function createSalesReturn(input: CreateSalesReturnInput): Promise<{ invoiceId: string; invoiceNo: string }> {
  const company = await Company.findById(input.companyId);
  if (!company) throw new AppError('Company not found', 404);
  if (input.returnType === 'ByRef' && !input.originalInvoiceId) {
    throw new AppError('Original invoice is required when return type is By Ref', 400);
  }

  const vatRatePct = input.vatType === 'NonVat' ? 0 : (company.vatConfig?.standardRate ?? 5);
  const returnDate = input.date ? new Date(input.date) : new Date();

  let itemsGross = 0;
  let itemsDiscount = 0;
  let itemsVat = 0;

  const lineItems: Array<{
    productId: mongoose.Types.ObjectId;
    productCode: string;
    imei?: string;
    description: string;
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
    unitId?: string;
    unitName?: string;
    multiUnitId?: string;
    batchNumber?: string;
  }> = [];

  // Merge items with same product + same batch into one line (add to last batch, don't create another)
  const mergedItems: typeof input.items = [];
  const keyToIndex = new Map<string, number>();
  for (const item of input.items) {
    const key = `${item.productId}|${item.batchNumber ?? ''}`;
    const existing = keyToIndex.get(key);
    if (existing !== undefined) {
      mergedItems[existing] = {
        ...mergedItems[existing],
        quantity: (mergedItems[existing].quantity ?? 0) + (item.quantity ?? 0),
        discount: (mergedItems[existing].discount ?? 0) + (item.discount ?? 0),
      };
    } else {
      keyToIndex.set(key, mergedItems.length);
      mergedItems.push({ ...item });
    }
  }

  let originalInvoiceNo: string | undefined;
  if (input.returnType === 'ByRef' && input.originalInvoiceId) {
    const originalInvoice = await SalesInvoice.findOne({ _id: input.originalInvoiceId, companyId: input.companyId }).lean();
    if (!originalInvoice) {
      throw new AppError('Original invoice not found', 404);
    }
    originalInvoiceNo = originalInvoice.invoiceNo;
    const originalItems = await SalesInvoiceItem.find({ invoiceId: originalInvoice._id }).lean();
    
    // Find all returns against this invoice
    const otherReturns = await SalesInvoice.find({
      companyId: input.companyId,
      type: 'Return',
      status: { $ne: 'Cancelled' },
      originalInvoiceId: originalInvoice._id,
    }).select('_id').lean();

    const returnedQuantities: Record<string, number> = {};
    if (otherReturns.length > 0) {
      const returnIds = otherReturns.map((r) => r._id);
      const returnItems = await SalesInvoiceItem.find({ invoiceId: { $in: returnIds } }).lean();
      for (const ri of returnItems) {
        const pId = ri.productId ? ri.productId.toString() : '';
        const key = `${pId}_${ri.batchNumber || ''}`;
        returnedQuantities[key] = (returnedQuantities[key] || 0) + (ri.quantity || 0);
      }
    }

    for (const item of mergedItems) {
      const matchingOriginalItems = originalItems.filter(
        (oi) =>
          oi.productId.toString() === item.productId.toString() &&
          (item.batchNumber ? oi.batchNumber === item.batchNumber : true)
      );
      if (matchingOriginalItems.length === 0) {
        throw new AppError(`Item "${item.description || 'Unknown'}" was not purchased in the referenced invoice.`, 400);
      }
      
      const totalPurchasedQty = matchingOriginalItems.reduce((sum, oi) => sum + (oi.quantity || 0), 0);
      
      let prevReturned = 0;
      if (item.batchNumber) {
        const key = `${item.productId}_${item.batchNumber}`;
        prevReturned = returnedQuantities[key] || 0;
      } else {
        const prefix = `${item.productId}_`;
        for (const [k, qty] of Object.entries(returnedQuantities)) {
          if (k.startsWith(prefix)) {
            prevReturned += qty;
          }
        }
      }
      
      const remaining = Math.max(0, totalPurchasedQty - prevReturned);

      if (item.quantity > remaining) {
        const desc = matchingOriginalItems[0].description || item.description || 'Unknown';
        throw new AppError(
          `Cannot return ${item.quantity} units of "${desc}". Only ${remaining} units are returnable (purchased: ${totalPurchasedQty}, already returned: ${prevReturned}).`,
          400
        );
      }
    }
  }

  for (const item of mergedItems) {
    const product = await Product.findById(item.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${item.productId}`, 404);
    }
    const qty = item.quantity;
    const price = item.unitPrice;
    const gross = qty * price;
    const discPct = item.discountPercent ?? 0;
    const disc = item.discount ?? (gross * discPct / 100);
    const net = gross - disc;
    const vatRate = input.vatType === 'NonVat' ? 0 : (vatRatePct);
    const taxMode = input.taxMode ?? 'exclusive';
    let vatAmt: number;
    let total: number;
    if (input.vatType === 'Vat' && taxMode === 'inclusive' && vatRate > 0) {
      vatAmt = parseFloat((net * vatRate / (100 + vatRate)).toFixed(2));
      total = parseFloat(net.toFixed(2));
    } else {
      vatAmt = parseFloat((net * (vatRate / 100)).toFixed(2));
      total = parseFloat((net + vatAmt).toFixed(2));
    }
    itemsGross += gross;
    itemsDiscount += disc;
    itemsVat += vatAmt;

    lineItems.push({
      productId: product._id,
      productCode: item.productCode ?? product.code ?? '',
      imei: item.imei ?? '',
      description: item.description ?? product.name,
      quantity: qty,
      unitPrice: price,
      grossAmount: gross,
      discountPercent: discPct,
      discount: disc,
      netAmount: net,
      vatRate,
      vatAmount: vatAmt,
      totalAmount: total,
      costPriceAtSale: product.purchasePrice ?? 0,
      unitId: item.unitId,
      unitName: item.unitName,
      multiUnitId: item.multiUnitId,
      batchNumber: item.batchNumber,
    });
  }

  const otherDiscount = input.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? 0;
  const lendAddLess = input.lendAddLess ?? 0;
  const roundOff = input.roundOff ?? 0;
  const isVat = input.vatType !== 'NonVat';
  const netAdjustments = otherCharges + freightCharge + lendAddLess + roundOff - otherDiscount;
  const vatFromAdjustments = isVat && netAdjustments !== 0
    ? parseFloat((netAdjustments * vatRatePct / (100 + vatRatePct)).toFixed(2))
    : 0;
  const totalVat = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));
  const taxableAmount = itemsGross - itemsDiscount;
  const subTotal = (input.taxMode === 'inclusive' && isVat) ? taxableAmount : (taxableAmount + itemsVat);
  const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + lendAddLess + roundOff;

  // Net amounts for adjustment ledgers (VAT-excluded when applicable, same as B2C)
  const netFactor = isVat ? 100 / (100 + vatRatePct) : 1;
  const otherDiscountNet = parseFloat((otherDiscount * netFactor).toFixed(2));
  const otherChargesNet = parseFloat((otherCharges * netFactor).toFixed(2));
  const freightChargeNet = parseFloat((freightCharge * netFactor).toFixed(2));
  const lendAddLessNet = parseFloat((lendAddLess * netFactor).toFixed(2));
  const roundOffNet = parseFloat((roundOff * netFactor).toFixed(2));
  const netAdjustmentsNet = otherChargesNet + freightChargeNet + lendAddLessNet - otherDiscountNet + roundOffNet;

  const invoiceNo = await getNextReturnInvoiceNo(input.companyId, input.financialYearId);

  const invoiceDoc = await SalesInvoice.create({
    companyId: input.companyId,
    financialYearId: input.financialYearId,
    invoiceNo,
    date: returnDate,
    time: returnDate.toTimeString().slice(0, 8),
    type: 'Return',
    customerId: input.customerId,
    customerName: input.customerName ?? 'Walk-in',
    customerAddress: input.customerAddress,
    customerPhone: input.customerPhone,
    cashAccountId: input.cashAccountId,
    rateType: 'Retail',
    paymentType: input.cashAccountId ? 'Cash' : (input.customerId ? 'Credit' : 'Cash'),
    vatType: input.vatType ?? 'Vat',
    taxMode: input.taxMode ?? 'exclusive',
    grossAmount: itemsGross,
    discountAmount: itemsDiscount,
    taxableAmount,
    vatAmount: totalVat,
    otherDiscount,
    otherCharges,
    freightCharge,
    lendAddLess,
    roundOff,
    totalAmount: grandTotal,
    cashReceived: 0,
    balance: 0,
    oldBalance: 0,
    netBalance: 0,
    paymentDetails: [],
    narration: input.narration ?? (input.returnType === 'ByRef' && input.originalInvoiceId ? `Sales Return against ${input.originalInvoiceId}` : 'Sales Return'),
    status: 'Final',
    originalInvoiceId: input.returnType === 'ByRef' ? input.originalInvoiceId : undefined,
    createdBy: input.createdBy,
  });

  const invoiceId = invoiceDoc._id;

  for (const line of lineItems) {
    await SalesInvoiceItem.create({
      invoiceId,
      productId: line.productId,
      productCode: line.productCode,
      imei: line.imei,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      grossAmount: line.grossAmount,
      discountPercent: line.discountPercent,
      discount: line.discount,
      netAmount: line.netAmount,
      vatRate: line.vatRate,
      vatAmount: line.vatAmount,
      totalAmount: line.totalAmount,
      costPriceAtSale: line.costPriceAtSale,
      unitId: line.unitId,
      unitName: line.unitName,
      multiUnitId: line.multiUnitId,
      batchNumber: line.batchNumber,
    });
  }

  // Inventory: add stock back (SalesReturn = quantityIn)
  for (const line of lineItems) {
    let stockQtyIn = line.quantity;
    if (line.multiUnitId) {
      const prod = await Product.findById(line.productId).lean();
      if (prod?.multiUnits) {
        const mu = prod.multiUnits.find((m: { multiUnitId?: string }) => m.multiUnitId === line.multiUnitId);
        if (mu && (mu as { conversion?: number }).conversion && (mu as { conversion: number }).conversion > 0) {
          stockQtyIn = line.quantity * (mu as { conversion: number }).conversion;
        }
      }
    }

    await InventoryTransaction.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      productId: line.productId,
      date: returnDate,
      type: 'SalesReturn',
      quantityIn: stockQtyIn,
      quantityOut: 0,
      costPrice: line.costPriceAtSale,
      referenceType: 'SalesInvoice',
      referenceId: invoiceId,
      batchNumber: line.batchNumber || undefined,
      narration: `Sales Return ${invoiceNo}${line.batchNumber ? ` Batch: ${line.batchNumber}` : ''}`,
      createdBy: input.createdBy,
    });
  }

  // Ledger: Debit Sales Return, adjustment ledgers (reversed from sales), Debit VAT; Credit Customer/Cash
  const salesReturnLedger = await findOrCreateSpecialLedger(input.companyId, 'Sales Returns', 'Expense', 'Expense');
  const vatLedger = isVat ? await findOrCreateVatLedger(input.companyId) : null;
  const customerLedger = input.customerId ? await LedgerAccount.findById(input.customerId) : null;
  const cashLedger = input.cashAccountId ? await LedgerAccount.findById(input.cashAccountId) : null;
  const creditLedger = cashLedger || customerLedger;

  // Same ledger names as B2C for adjustment details
  const otherDiscountLedger = otherDiscount > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Discount on Sales', 'Expense', 'Expense') : null;
  const otherChargesLedger = otherCharges > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Charges on Sales', 'Revenue', 'Income') : null;
  const freightChargesLedger = freightCharge > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Freight Charges on Sales', 'Revenue', 'Income') : null;
  const travelChargesLedger = lendAddLess > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Travel Charges on Sales', 'Revenue', 'Income') : null;
  const roundOffLedger = Math.abs(roundOff) > 0.001 ? await findOrCreateSpecialLedger(input.companyId, 'Round Off on Sales', 'Expense', 'Expense') : null;

  if (creditLedger) {
    const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];
    const refSuffix = originalInvoiceNo ? ` against ${originalInvoiceNo}` : '';

    // Debit Sales Return (net of VAT and adjustment reversals)
    const salesReturnDebit = grandTotal - totalVat - netAdjustmentsNet;
    voucherLines.push({
      ledgerAccountId: salesReturnLedger._id.toString(),
      debitAmount: salesReturnDebit,
      creditAmount: 0,
      narration: `Sales Return ${invoiceNo}${refSuffix}`,
    });

    // Debit VAT (reverse output VAT)
    if (vatLedger && totalVat > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: totalVat,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - VAT${refSuffix}`,
      });
    }

    // Adjustment ledgers (reverse of B2C sale): Credit Other Discount, Debit Other Charges, Debit Freight, Debit Travel, Round Off reversed
    if (otherDiscountLedger && otherDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: otherDiscountLedger._id.toString(),
        debitAmount: 0,
        creditAmount: otherDiscountNet,
        narration: `Sales Return ${invoiceNo} - Other Discount${refSuffix}`,
      });
    }
    if (otherChargesLedger && otherCharges > 0) {
      voucherLines.push({
        ledgerAccountId: otherChargesLedger._id.toString(),
        debitAmount: otherChargesNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Other Charges${refSuffix}`,
      });
    }
    if (freightChargesLedger && freightCharge > 0) {
      voucherLines.push({
        ledgerAccountId: freightChargesLedger._id.toString(),
        debitAmount: freightChargeNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Freight Charges${refSuffix}`,
      });
    }
    if (travelChargesLedger && lendAddLess > 0) {
      voucherLines.push({
        ledgerAccountId: travelChargesLedger._id.toString(),
        debitAmount: lendAddLessNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Travel Charges${refSuffix}`,
      });
    }
    if (roundOffLedger && Math.abs(roundOff) > 0.001) {
      voucherLines.push({
        ledgerAccountId: roundOffLedger._id.toString(),
        debitAmount: roundOffNet > 0 ? roundOffNet : 0,
        creditAmount: roundOffNet < 0 ? Math.abs(roundOffNet) : 0,
        narration: `Sales Return ${invoiceNo} - Round Off${refSuffix}`,
      });
    }

    // Credit Customer/Cash (refund)
    voucherLines.push({
      ledgerAccountId: creditLedger._id.toString(),
      debitAmount: 0,
      creditAmount: grandTotal,
      narration: cashLedger ? `Sales Return ${invoiceNo} - Cash Refund${refSuffix}` : `Sales Return ${invoiceNo} - On Account${refSuffix}`,
    });

    let totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    let totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01) {
      // Adjust Sales Return debit (first line) to balance
      if (totalDebit > totalCredit) {
        voucherLines[0].debitAmount = (voucherLines[0].debitAmount || 0) - diff;
      } else {
        voucherLines[0].debitAmount = (voucherLines[0].debitAmount || 0) + diff;
      }
    }
    const v = await voucherService.createAndPost({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      voucherType: 'Journal',
      date: returnDate,
      lines: voucherLines,
      narration: `Sales Return ${invoiceNo}${refSuffix}`,
      createdBy: input.createdBy,
    });
    await SalesInvoice.updateOne({ _id: invoiceId }, { voucherId: v._id });
  }

  return { invoiceId: invoiceId.toString(), invoiceNo };
}

export async function updateSalesReturn(
  invoiceId: string,
  companyId: string,
  input: CreateSalesReturnInput,
  userId: string
): Promise<{ invoiceId: string; invoiceNo: string } | null> {
  const existing = await SalesInvoice.findOne({ _id: invoiceId, companyId, type: 'Return' });
  if (!existing) return null;

  const company = await Company.findById(companyId);
  if (!company) throw new AppError('Company not found', 404);
  if (input.returnType === 'ByRef' && !input.originalInvoiceId) {
    throw new AppError('Original invoice is required when return type is By Ref', 400);
  }

  const vatRatePct = input.vatType === 'NonVat' ? 0 : (company.vatConfig?.standardRate ?? 5);
  const returnDate = input.date ? new Date(input.date) : existing.date;
  const invoiceNo = existing.invoiceNo;

  let originalInvoiceNo: string | undefined;
  if (input.returnType === 'ByRef' && input.originalInvoiceId) {
    const originalInvoice = await SalesInvoice.findOne({ _id: input.originalInvoiceId, companyId: input.companyId }).lean();
    if (!originalInvoice) {
      throw new AppError('Original invoice not found', 404);
    }
    originalInvoiceNo = originalInvoice.invoiceNo;
    const originalItems = await SalesInvoiceItem.find({ invoiceId: originalInvoice._id }).lean();
    
    // Find all returns against this invoice, excluding the current return we are updating
    const otherReturns = await SalesInvoice.find({
      companyId: input.companyId,
      type: 'Return',
      status: { $ne: 'Cancelled' },
      originalInvoiceId: originalInvoice._id,
      _id: { $ne: new mongoose.Types.ObjectId(invoiceId) }
    }).select('_id').lean();

    const returnedQuantities: Record<string, number> = {};
    if (otherReturns.length > 0) {
      const returnIds = otherReturns.map((r) => r._id);
      const returnItems = await SalesInvoiceItem.find({ invoiceId: { $in: returnIds } }).lean();
      for (const ri of returnItems) {
        const pId = ri.productId ? ri.productId.toString() : '';
        const key = `${pId}_${ri.batchNumber || ''}`;
        returnedQuantities[key] = (returnedQuantities[key] || 0) + (ri.quantity || 0);
      }
    }

    // Merge items with same product + same batch to check total requested return qty
    const checkMergedItems: typeof input.items = [];
    const keyToIndex = new Map<string, number>();
    for (const item of input.items) {
      const key = `${item.productId}|${item.batchNumber ?? ''}`;
      const existingIdx = keyToIndex.get(key);
      if (existingIdx !== undefined) {
        checkMergedItems[existingIdx] = {
          ...checkMergedItems[existingIdx],
          quantity: (checkMergedItems[existingIdx].quantity ?? 0) + (item.quantity ?? 0),
        };
      } else {
        keyToIndex.set(key, checkMergedItems.length);
        checkMergedItems.push({ ...item });
      }
    }

    for (const item of checkMergedItems) {
      const matchingOriginalItems = originalItems.filter(
        (oi) =>
          oi.productId.toString() === item.productId.toString() &&
          (item.batchNumber ? oi.batchNumber === item.batchNumber : true)
      );
      if (matchingOriginalItems.length === 0) {
        throw new AppError(`Item "${item.description || 'Unknown'}" was not purchased in the referenced invoice.`, 400);
      }
      
      const totalPurchasedQty = matchingOriginalItems.reduce((sum, oi) => sum + (oi.quantity || 0), 0);
      
      let prevReturned = 0;
      if (item.batchNumber) {
        const key = `${item.productId}_${item.batchNumber}`;
        prevReturned = returnedQuantities[key] || 0;
      } else {
        const prefix = `${item.productId}_`;
        for (const [k, qty] of Object.entries(returnedQuantities)) {
          if (k.startsWith(prefix)) {
            prevReturned += qty;
          }
        }
      }
      
      const remaining = Math.max(0, totalPurchasedQty - prevReturned);

      if (item.quantity > remaining) {
        const desc = matchingOriginalItems[0].description || item.description || 'Unknown';
        throw new AppError(
          `Cannot return ${item.quantity} units of "${desc}". Only ${remaining} units are returnable (purchased: ${totalPurchasedQty}, already returned: ${prevReturned}).`,
          400
        );
      }
    }
  }

  // Remove old effects: inventory and ledger
  await InventoryTransaction.deleteMany({ referenceId: existing._id, referenceType: 'SalesInvoice' });
  await SalesInvoiceItem.deleteMany({ invoiceId: existing._id });
  if (existing.voucherId) {
    try {
      const { LedgerEntry } = await import('../models/LedgerEntry');
      await LedgerEntry.deleteMany({ voucherId: existing.voucherId });
      await Voucher.deleteOne({ _id: existing.voucherId });
    } catch (e) {
      console.error(`[Sales Return Update] Failed to remove voucher ${existing.voucherId}:`, (e as Error).message || e);
    }
  }

  let itemsGross = 0;
  let itemsDiscount = 0;
  let itemsVat = 0;

  const lineItems: Array<{
    productId: mongoose.Types.ObjectId;
    productCode: string;
    imei?: string;
    description: string;
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
    unitId?: string;
    unitName?: string;
    multiUnitId?: string;
    batchNumber?: string;
  }> = [];

  const mergedItems: typeof input.items = [];
  const keyToIndex = new Map<string, number>();
  for (const item of input.items) {
    const key = `${item.productId}|${item.batchNumber ?? ''}`;
    const existingIdx = keyToIndex.get(key);
    if (existingIdx !== undefined) {
      mergedItems[existingIdx] = {
        ...mergedItems[existingIdx],
        quantity: (mergedItems[existingIdx].quantity ?? 0) + (item.quantity ?? 0),
        discount: (mergedItems[existingIdx].discount ?? 0) + (item.discount ?? 0),
      };
    } else {
      keyToIndex.set(key, mergedItems.length);
      mergedItems.push({ ...item });
    }
  }

  for (const item of mergedItems) {
    const product = await Product.findById(item.productId).lean();
    if (!product || product.companyId.toString() !== input.companyId) {
      throw new AppError(`Product not found: ${item.productId}`, 404);
    }
    const qty = item.quantity;
    const price = item.unitPrice;
    const gross = qty * price;
    const discPct = item.discountPercent ?? 0;
    const disc = item.discount ?? (gross * discPct / 100);
    const net = gross - disc;
    const vatRate = input.vatType === 'NonVat' ? 0 : vatRatePct;
    const taxMode = input.taxMode ?? 'exclusive';
    let vatAmt: number;
    let total: number;
    if (input.vatType === 'Vat' && taxMode === 'inclusive' && vatRate > 0) {
      vatAmt = parseFloat((net * vatRate / (100 + vatRate)).toFixed(2));
      total = parseFloat(net.toFixed(2));
    } else {
      vatAmt = parseFloat((net * (vatRate / 100)).toFixed(2));
      total = parseFloat((net + vatAmt).toFixed(2));
    }
    itemsGross += gross;
    itemsDiscount += disc;
    itemsVat += vatAmt;

    lineItems.push({
      productId: product._id,
      productCode: item.productCode ?? product.code ?? '',
      imei: item.imei ?? '',
      description: item.description ?? product.name,
      quantity: qty,
      unitPrice: price,
      grossAmount: gross,
      discountPercent: discPct,
      discount: disc,
      netAmount: net,
      vatRate,
      vatAmount: vatAmt,
      totalAmount: total,
      costPriceAtSale: product.purchasePrice ?? 0,
      unitId: item.unitId,
      unitName: item.unitName,
      multiUnitId: item.multiUnitId,
      batchNumber: item.batchNumber,
    });
  }

  const otherDiscount = input.otherDiscount ?? 0;
  const otherCharges = input.otherCharges ?? 0;
  const freightCharge = input.freightCharge ?? 0;
  const lendAddLess = input.lendAddLess ?? 0;
  const roundOff = input.roundOff ?? 0;
  const isVat = input.vatType !== 'NonVat';
  const netAdjustments = otherCharges + freightCharge + lendAddLess + roundOff - otherDiscount;
  const vatFromAdjustments = isVat && netAdjustments !== 0
    ? parseFloat((netAdjustments * vatRatePct / (100 + vatRatePct)).toFixed(2))
    : 0;
  const totalVat = parseFloat((itemsVat + vatFromAdjustments).toFixed(2));
  const taxableAmount = itemsGross - itemsDiscount;
  const subTotal = (input.taxMode === 'inclusive' && isVat) ? taxableAmount : (taxableAmount + itemsVat);
  const grandTotal = subTotal - otherDiscount + otherCharges + freightCharge + lendAddLess + roundOff;

  const netFactor = isVat ? 100 / (100 + vatRatePct) : 1;
  const otherDiscountNet = parseFloat((otherDiscount * netFactor).toFixed(2));
  const otherChargesNet = parseFloat((otherCharges * netFactor).toFixed(2));
  const freightChargeNet = parseFloat((freightCharge * netFactor).toFixed(2));
  const lendAddLessNet = parseFloat((lendAddLess * netFactor).toFixed(2));
  const roundOffNet = parseFloat((roundOff * netFactor).toFixed(2));
  const netAdjustmentsNet = otherChargesNet + freightChargeNet + lendAddLessNet - otherDiscountNet + roundOffNet;

  for (const line of lineItems) {
    await SalesInvoiceItem.create({
      invoiceId: existing._id,
      productId: line.productId,
      productCode: line.productCode,
      imei: line.imei,
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      grossAmount: line.grossAmount,
      discountPercent: line.discountPercent,
      discount: line.discount,
      netAmount: line.netAmount,
      vatRate: line.vatRate,
      vatAmount: line.vatAmount,
      totalAmount: line.totalAmount,
      costPriceAtSale: line.costPriceAtSale,
      unitId: line.unitId,
      unitName: line.unitName,
      multiUnitId: line.multiUnitId,
      batchNumber: line.batchNumber,
    });
  }

  for (const line of lineItems) {
    let stockQtyIn = line.quantity;
    if (line.multiUnitId) {
      const prod = await Product.findById(line.productId).lean();
      if (prod?.multiUnits) {
        const mu = prod.multiUnits.find((m: { multiUnitId?: string }) => m.multiUnitId === line.multiUnitId);
        if (mu && (mu as { conversion?: number }).conversion && (mu as { conversion: number }).conversion > 0) {
          stockQtyIn = line.quantity * (mu as { conversion: number }).conversion;
        }
      }
    }

    await InventoryTransaction.create({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      productId: line.productId,
      date: returnDate,
      type: 'SalesReturn',
      quantityIn: stockQtyIn,
      quantityOut: 0,
      costPrice: line.costPriceAtSale,
      referenceType: 'SalesInvoice',
      referenceId: existing._id,
      batchNumber: line.batchNumber || undefined,
      narration: `Sales Return ${invoiceNo}${line.batchNumber ? ` Batch: ${line.batchNumber}` : ''}`,
      createdBy: userId,
    });
  }

  await SalesInvoice.updateOne(
    { _id: existing._id },
    {
      $set: {
        date: returnDate,
        customerId: input.customerId,
        customerName: input.customerName ?? 'Walk-in',
        customerAddress: input.customerAddress,
        customerPhone: input.customerPhone,
        cashAccountId: input.cashAccountId,
        vatType: input.vatType ?? 'Vat',
        taxMode: input.taxMode ?? 'exclusive',
        grossAmount: itemsGross,
        discountAmount: itemsDiscount,
        taxableAmount: itemsGross - itemsDiscount,
        vatAmount: totalVat,
        otherDiscount,
        otherCharges,
        freightCharge,
        lendAddLess,
        roundOff,
        totalAmount: grandTotal,
        narration: input.narration ?? (input.returnType === 'ByRef' && input.originalInvoiceId ? `Sales Return against ${input.originalInvoiceId}` : 'Sales Return'),
        originalInvoiceId: input.returnType === 'ByRef' ? input.originalInvoiceId : undefined,
      },
    }
  );

  const salesReturnLedger = await findOrCreateSpecialLedger(input.companyId, 'Sales Returns', 'Expense', 'Expense');
  const vatLedger = isVat ? await findOrCreateVatLedger(input.companyId) : null;
  const customerLedger = input.customerId ? await LedgerAccount.findById(input.customerId) : null;
  const cashLedger = input.cashAccountId ? await LedgerAccount.findById(input.cashAccountId) : null;
  const creditLedger = cashLedger || customerLedger;

  const otherDiscountLedger = otherDiscount > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Discount on Sales', 'Expense', 'Expense') : null;
  const otherChargesLedger = otherCharges > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Other Charges on Sales', 'Revenue', 'Income') : null;
  const freightChargesLedger = freightCharge > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Freight Charges on Sales', 'Revenue', 'Income') : null;
  const travelChargesLedger = lendAddLess > 0 ? await findOrCreateSpecialLedger(input.companyId, 'Travel Charges on Sales', 'Revenue', 'Income') : null;
  const roundOffLedger = Math.abs(roundOff) > 0.001 ? await findOrCreateSpecialLedger(input.companyId, 'Round Off on Sales', 'Expense', 'Expense') : null;

  if (creditLedger) {
    const voucherLines: Array<{ ledgerAccountId: string; debitAmount: number; creditAmount: number; narration?: string }> = [];
    const refSuffix = originalInvoiceNo ? ` against ${originalInvoiceNo}` : '';

    const salesReturnDebit = grandTotal - totalVat - netAdjustmentsNet;
    voucherLines.push({
      ledgerAccountId: salesReturnLedger._id.toString(),
      debitAmount: salesReturnDebit,
      creditAmount: 0,
      narration: `Sales Return ${invoiceNo}${refSuffix}`,
    });
    if (vatLedger && totalVat > 0) {
      voucherLines.push({
        ledgerAccountId: vatLedger._id.toString(),
        debitAmount: totalVat,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - VAT${refSuffix}`,
      });
    }
    if (otherDiscountLedger && otherDiscount > 0) {
      voucherLines.push({
        ledgerAccountId: otherDiscountLedger._id.toString(),
        debitAmount: 0,
        creditAmount: otherDiscountNet,
        narration: `Sales Return ${invoiceNo} - Other Discount${refSuffix}`,
      });
    }
    if (otherChargesLedger && otherCharges > 0) {
      voucherLines.push({
        ledgerAccountId: otherChargesLedger._id.toString(),
        debitAmount: otherChargesNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Other Charges${refSuffix}`,
      });
    }
    if (freightChargesLedger && freightCharge > 0) {
      voucherLines.push({
        ledgerAccountId: freightChargesLedger._id.toString(),
        debitAmount: freightChargeNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Freight Charges${refSuffix}`,
      });
    }
    if (travelChargesLedger && lendAddLess > 0) {
      voucherLines.push({
        ledgerAccountId: travelChargesLedger._id.toString(),
        debitAmount: lendAddLessNet,
        creditAmount: 0,
        narration: `Sales Return ${invoiceNo} - Travel Charges${refSuffix}`,
      });
    }
    if (roundOffLedger && Math.abs(roundOff) > 0.001) {
      voucherLines.push({
        ledgerAccountId: roundOffLedger._id.toString(),
        debitAmount: roundOffNet > 0 ? roundOffNet : 0,
        creditAmount: roundOffNet < 0 ? Math.abs(roundOffNet) : 0,
        narration: `Sales Return ${invoiceNo} - Round Off${refSuffix}`,
      });
    }
    voucherLines.push({
      ledgerAccountId: creditLedger._id.toString(),
      debitAmount: 0,
      creditAmount: grandTotal,
      narration: cashLedger ? `Sales Return ${invoiceNo} - Cash Refund${refSuffix}` : `Sales Return ${invoiceNo} - On Account${refSuffix}`,
    });

    let totalDebit = voucherLines.reduce((s, l) => s + l.debitAmount, 0);
    let totalCredit = voucherLines.reduce((s, l) => s + l.creditAmount, 0);
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.01) {
      if (totalDebit > totalCredit) {
        voucherLines[0].debitAmount = (voucherLines[0].debitAmount || 0) - diff;
      } else {
        voucherLines[0].debitAmount = (voucherLines[0].debitAmount || 0) + diff;
      }
    }
    const v = await voucherService.createAndPost({
      companyId: input.companyId,
      financialYearId: input.financialYearId,
      voucherType: 'Journal',
      date: returnDate,
      lines: voucherLines,
      narration: `Sales Return ${invoiceNo}${refSuffix}`,
      createdBy: userId,
    });
    await SalesInvoice.updateOne({ _id: existing._id }, { voucherId: v._id });
  }

  return { invoiceId: existing._id.toString(), invoiceNo };
}

export async function searchSalesReturnByInvoiceNo(companyId: string, invoiceNo: string) {
  const invoice = await SalesInvoice.findOne({
    companyId,
    type: 'Return',
    invoiceNo: new RegExp(invoiceNo.trim(), 'i'),
  }).lean();
  if (!invoice) return null;
  return getSalesReturn(invoice._id.toString(), companyId);
}

export async function getSalesReturn(invoiceId: string, companyId: string) {
  const invoice = await SalesInvoice.findOne({ _id: invoiceId, companyId, type: 'Return' })
    .populate('originalInvoiceId', 'invoiceNo')
    .lean();
  if (!invoice) return null;
  const items = await SalesInvoiceItem.find({ invoiceId }).lean();
  return {
    _id: invoice._id,
    invoiceNo: invoice.invoiceNo,
    date: invoice.date,
    returnType: invoice.originalInvoiceId ? 'ByRef' : 'OnAccount',
    originalInvoiceId: invoice.originalInvoiceId ? String((invoice.originalInvoiceId as any)._id || invoice.originalInvoiceId) : undefined,
    originalInvoiceNo: invoice.originalInvoiceId && typeof invoice.originalInvoiceId === 'object'
      ? (invoice.originalInvoiceId as any).invoiceNo
      : undefined,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    customerAddress: invoice.customerAddress,
    cashAccountId: invoice.cashAccountId,
    vatType: invoice.vatType,
    taxMode: invoice.taxMode ?? 'exclusive',
    items: items.map((i) => ({
      _id: i._id,
      productId: i.productId,
      productCode: i.productCode,
      imei: i.imei,
      description: i.description,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount,
      totalAmount: i.totalAmount,
      unitName: i.unitName,
      batchNumber: i.batchNumber,
    })),
    otherDiscount: invoice.otherDiscount,
    otherCharges: invoice.otherCharges,
    freightCharge: invoice.freightCharge,
    lendAddLess: invoice.lendAddLess,
    roundOff: invoice.roundOff,
    totalAmount: invoice.totalAmount,
    narration: invoice.narration,
  };
}

export async function deleteSalesReturn(invoiceId: string, companyId: string): Promise<boolean> {
  const invoice = await SalesInvoice.findOne({ _id: invoiceId, companyId, type: 'Return' });
  if (!invoice) return false;

  await SalesInvoiceItem.deleteMany({ invoiceId });
  await InventoryTransaction.deleteMany({ referenceId: invoiceId, referenceType: 'SalesInvoice' });

  if (invoice.voucherId) {
    try {
      const { LedgerEntry } = await import('../models/LedgerEntry');
      await LedgerEntry.deleteMany({ voucherId: invoice.voucherId });
      await Voucher.deleteOne({ _id: invoice.voucherId });
    } catch (e) {
      console.error(`[Sales Return Delete] Failed to reverse voucher ${invoice.voucherId}:`, (e as Error).message || e);
    }
  }

  await SalesInvoice.deleteOne({ _id: invoiceId });
  return true;
}
