import mongoose from 'mongoose';
import { Product, IProduct } from '../models/Product';
import { UnitOfMeasure } from '../models/UnitOfMeasure';
import { ProductCategory } from '../models/ProductCategory';
import { SalesInvoiceItem } from '../models/SalesInvoiceItem';
import { InventoryTransaction } from '../models/InventoryTransaction';
import { AppError } from '../middlewares/errorHandler';

const AUTO_IMEI_START = 501; // Auto IMEI sequence starts at 000501

// Generate unique multiUnitId
function generateMultiUnitId(): string {
  return `MU-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get next unique auto IMEI for the company, starting at 000501 and incrementing.
 * Checks both main imei and multiUnits.imei across all products.
 */
export async function getNextAutoImei(companyId: string): Promise<string> {
  const products = await Product.find({ companyId }).select('imei multiUnits.imei').lean();
  const used = new Set<number>();
  for (const p of products) {
    const main = (p.imei || '').toString().trim();
    const mainNum = parseInt(main, 10);
    if (!isNaN(mainNum) && mainNum >= AUTO_IMEI_START) used.add(mainNum);
    const mus = (p as any).multiUnits as Array<{ imei?: string }> | undefined;
    if (mus) {
      for (const mu of mus) {
        const v = (mu.imei || '').toString().trim();
        const n = parseInt(v, 10);
        if (!isNaN(n) && n >= AUTO_IMEI_START) used.add(n);
      }
    }
  }
  let next = AUTO_IMEI_START;
  while (used.has(next)) next += 1;
  return next.toString().padStart(6, '0');
}

// Check if a multi-unit is used in any transaction
async function isMultiUnitUsedInTransaction(multiUnitId: string): Promise<boolean> {
  const count = await SalesInvoiceItem.countDocuments({ multiUnitId });
  return count > 0;
}

// Get multi-unit details for error message
async function getMultiUnitUsageInfo(multiUnitId: string, productName: string): Promise<string> {
  const count = await SalesInvoiceItem.countDocuments({ multiUnitId });
  if (count > 0) {
    return `Multi-unit (ID: ${multiUnitId}) from product "${productName}" is used in ${count} transaction(s) and cannot be deleted.`;
  }
  return '';
}

export interface MultiUnitInput {
  multiUnitId?: string;
  imei: string;
  conversion: number;
  price: number;
  totalPrice: number;
  unitId: string;
  wholesale?: number;
  retail?: number;
  specialPrice1?: number;
  specialPrice2?: number;
}

export interface CreateProductInput {
  companyId: string;
  code?: string;
  name: string;
  imei?: string;
  sku?: string;
  internationalBarcode?: string;
  itemGroup?: string;
  brand?: string;
  categoryId?: string;
  defaultVendorId?: string;
  vatPercent?: number;
  unitOfMeasureId: string;
  retailPrice?: number;
  wholesalePrice?: number;
  purchasePrice?: number;
  specialPrice?: number;
  specialPrice2?: number;
  imageUrl?: string;
  allowBatches?: boolean;
  multiUnits?: MultiUnitInput[];
  sellingPrice?: number;
  mrp?: number;
  minStockLevel?: number;
  reorderLevel?: number;
  vatCategory?: string;
  createdBy?: string;
}

export async function getNextProductCode(companyId: string): Promise<string> {
  const products = await Product.find({ companyId, code: /^prod\d*$/i }).select('code').lean();
  let max = -1;
  for (const p of products) {
    const code = (p.code || '').toLowerCase();
    if (code === 'prod') max = Math.max(max, 0);
    else {
      const num = parseInt(code.replace(/^prod/i, '') || '0', 10);
      if (!isNaN(num)) max = Math.max(max, num);
    }
  }
  return max < 0 ? 'prod1' : `prod${max + 1}`;
}

export async function createProduct(input: CreateProductInput): Promise<IProduct> {
  const companyId = input.companyId;
  const codeToUse = (input.code && input.code.trim()) ? input.code.trim() : await getNextProductCode(companyId);

  const existingCode = await Product.findOne({ companyId, code: new RegExp(`^${escapeRegex(codeToUse)}$`, 'i') });
  if (existingCode) throw new AppError('Product code already in use', 400);
  const existingName = await Product.findOne({ companyId, name: new RegExp(`^${escapeRegex(input.name.trim())}$`, 'i') });
  if (existingName) throw new AppError('Product name already in use', 400);
  // Auto-generate IMEI if user didn't provide one
  const imeiProvided = input.imei && input.imei.trim();
  const mainImeiToUse = imeiProvided ? input.imei!.trim() : await getNextAutoImei(companyId);

  if (imeiProvided) {
    const usedByProduct = await findProductNameByImei(companyId, mainImeiToUse);
    if (usedByProduct) throw new AppError(`IMEI number already present. This IMEI is used by product: ${usedByProduct}. Main IMEI and Multi Unit IMEI must be unique across all products.`, 400);
  }
  const multiUnits = (input.multiUnits || []).map((u) => ({
    multiUnitId: u.multiUnitId || generateMultiUnitId(),
    imei: (u.imei || '').trim(),
    conversion: Number(u.conversion) || 1,
    price: Number(u.price) || 0,
    totalPrice: Number(u.totalPrice) || 0,
    unitId: u.unitId,
    wholesale: Number(u.wholesale) || 0,
    retail: Number(u.retail) || 0,
    specialPrice1: Number(u.specialPrice1) || 0,
    specialPrice2: Number(u.specialPrice2) || 0,
  }));
  
  // Validate unique units: main unit should not be same as any multi-unit's unit
  const mainUnitId = input.unitOfMeasureId;
  const multiUnitIds = multiUnits.map((u) => u.unitId).filter(Boolean);
  if (mainUnitId && multiUnitIds.includes(mainUnitId)) {
    throw new AppError('Main product unit cannot be the same as a Multi Unit unit. Each unit must be unique.', 400);
  }
  // Check for duplicate units within multi-units
  const seenUnits = new Set<string>();
  for (const unitId of multiUnitIds) {
    if (seenUnits.has(unitId)) {
      throw new AppError('Duplicate unit in Multi Unit section. Each multi-unit must have a unique unit.', 400);
    }
    seenUnits.add(unitId);
  }
  
  const multiImeis = multiUnits.map((u) => u.imei).filter(Boolean);
  if (mainImeiToUse && multiImeis.includes(mainImeiToUse)) throw new AppError('IMEI number already present in Multi Unit. Use a different IMEI for main or remove it from Multi Unit.', 400);
  const seen = new Set<string>();
  for (const im of multiImeis) {
    if (seen.has(im)) throw new AppError(`Duplicate IMEI in Multi Unit: ${im}`, 400);
    seen.add(im);
  }
  for (const u of multiUnits) {
    if (u.imei) {
      const usedByProduct = await findProductNameByImei(companyId, u.imei);
      if (usedByProduct) throw new AppError(`IMEI number already present. This IMEI is used by product: ${usedByProduct}. Main IMEI and Multi Unit IMEI must be unique across all products (e.g. PROD1 main IMEI cannot be same as PROD2 Multi Unit IMEI).`, 400);
    }
  }

  const sku = input.sku || codeToUse;
  const systemBarcode = mainImeiToUse || `SYS-${Date.now()}`;

  const product = await Product.create({
    companyId,
    code: codeToUse,
    name: input.name.trim(),
    imei: mainImeiToUse,
    sku,
    internationalBarcode: input.internationalBarcode,
    systemBarcode,
    itemGroup: input.itemGroup?.trim(),
    brand: input.brand?.trim(),
    categoryId: input.categoryId,
    defaultVendorId: input.defaultVendorId,
    vatPercent: 5,
    unitOfMeasureId: input.unitOfMeasureId,
    retailPrice: input.retailPrice ?? input.sellingPrice ?? 0,
    wholesalePrice: input.wholesalePrice ?? input.mrp ?? 0,
    purchasePrice: input.purchasePrice ?? 0,
    specialPrice: input.specialPrice,
    specialPrice2: input.specialPrice2,
    imageUrl: input.imageUrl,
    allowBatches: input.allowBatches ?? true,
    multiUnits,
    sellingPrice: input.sellingPrice ?? input.retailPrice ?? 0,
    mrp: input.mrp ?? input.wholesalePrice,
    vatCategory: 'standard',
    minStockLevel: input.minStockLevel,
    reorderLevel: input.reorderLevel,
    status: 'active',
    createdBy: input.createdBy,
  });
  // Populate references before returning
  const populated = await Product.findById(product._id)
    .populate('unitOfMeasureId', 'name shortCode')
    .populate('categoryId', 'name code')
    .populate('multiUnits.unitId', 'name shortCode')
    .lean() as unknown as IProduct | null;
  return populated || product.toObject();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find product name that has this IMEI as main imei OR in multiUnits.
 * Rule: Main IMEI and Multi Unit IMEI must be unique across all products
 * (e.g. PROD1 main IMEI cannot equal PROD2 Multi Unit IMEI).
 */
export async function findProductNameByImei(
  companyId: string,
  imei: string,
  excludeProductId?: string
): Promise<string | null> {
  if (!imei || !imei.trim()) return null;
  const trim = imei.trim();
  const filter: Record<string, unknown> = {
    companyId,
    $or: [
      { imei: trim },
      { 'multiUnits.imei': trim },
    ],
  };
  if (excludeProductId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeProductId) };
  const doc = await Product.findOne(filter).select('name').lean();
  return doc ? (doc.name as string) : null;
}

export async function findByImei(companyId: string, imei: string): Promise<{ product: IProduct; matchedMultiUnitId?: string } | null> {
  if (!imei || !imei.trim()) return null;
  const trim = String(imei).trim();
  
  // Search in both main IMEI and multi-unit IMEI
  const product = await Product.findOne({
    companyId,
    $or: [
      { imei: trim },
      { 'multiUnits.imei': trim }
    ]
  })
    .populate('unitOfMeasureId', 'name shortCode')
    .populate('categoryId', 'name code')
    .populate('multiUnits.unitId', 'name shortCode')
    .lean();
  
  if (!product) {
    return null;
  }
  
  const typedProduct = product as unknown as IProduct;

  // Check if main IMEI matches (string comparison)
  const mainImei = typedProduct.imei ? String(typedProduct.imei).trim() : '';
  if (mainImei && mainImei === trim) {
    return { product: typedProduct };
  }
  
  // Check if multi-unit IMEI matches (only if allowBatches is disabled)
  if ((typedProduct as any).allowBatches === false) {
    const matchedMultiUnit = typedProduct.multiUnits?.find((mu) => {
      const muImei = mu.imei ? String(mu.imei).trim() : '';
      return muImei === trim;
    });
    if (matchedMultiUnit) {
      return { product: typedProduct, matchedMultiUnitId: matchedMultiUnit.multiUnitId };
    }
  }
  
  // Fallback - return product without matched multi-unit
  return { product: typedProduct };
}

export async function findByBarcode(
  companyId: string,
  barcode: string
): Promise<IProduct | null> {
  return Product.findOne({
    companyId,
    status: 'active',
    $or: [{ internationalBarcode: barcode }, { systemBarcode: barcode }, { sku: barcode }, { imei: barcode }],
  })
    .populate('unitOfMeasureId', 'name shortCode')
    .populate('categoryId', 'name code')
    .populate('multiUnits.unitId', 'name shortCode')
    .lean() as unknown as IProduct | null;
}

export async function list(
  companyId: string,
  opts: { search?: string; categoryId?: string; page?: number; limit?: number } = {}
): Promise<{ products: IProduct[]; total: number }> {
  const filter: Record<string, unknown> = { companyId };
  if (opts.categoryId) filter.categoryId = opts.categoryId;
  if (opts.search) {
    filter.$or = [
      { name: new RegExp(opts.search, 'i') },
      { code: new RegExp(opts.search, 'i') },
      { imei: opts.search },
      { sku: new RegExp(opts.search, 'i') },
      { internationalBarcode: opts.search },
      { systemBarcode: opts.search },
    ];
  }
  const total = await Product.countDocuments(filter);
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const docs = await Product.find(filter)
    .populate('unitOfMeasureId', 'name shortCode')
    .populate('categoryId', 'name code')
    .populate('multiUnits.unitId', 'name shortCode')
    .sort({ name: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean() as unknown as IProduct[];
  // Ensure allowBatches is always a boolean (default true) so frontend never gets undefined
  const products = docs.map((p) => ({ ...p, allowBatches: p.allowBatches !== false })) as IProduct[];
  return { products, total };
}

export async function getById(productId: string, companyId: string): Promise<IProduct | null> {
  const doc = await Product.findOne({ _id: productId, companyId })
    .populate('unitOfMeasureId')
    .populate('categoryId')
    .populate('defaultVendorId', 'name code')
    .populate('multiUnits.unitId', 'name shortCode')
    .lean() as unknown as IProduct | null;
  if (!doc) return null;
  // Default is true (batches enabled). Only false when explicitly set to false in DB (merged products like Lenova).
  return { ...doc, allowBatches: doc.allowBatches !== false } as IProduct;
}

export async function getUnitOfMeasures(_companyId?: string) {
  // Units are now global - return all units
  return UnitOfMeasure.find({}).sort({ shortCode: 1 }).lean();
}

export async function getCategories(companyId: string) {
  return ProductCategory.find({ companyId }).sort({ code: 1 }).lean();
}

export async function createCategory(
  companyId: string,
  input: { name: string; code: string },
  createdBy?: string
) {
  const name = input.name?.trim();
  const code = (input.code?.trim() || name || 'CAT').toUpperCase().replace(/\s+/g, '_');
  if (!name) throw new AppError('Category name is required', 400);
  const existing = await ProductCategory.findOne({
    companyId,
    code: new RegExp(`^${escapeRegex(code)}$`, 'i'),
  });
  if (existing) throw new AppError('Category code already in use', 400);
  const doc = await ProductCategory.create({
    companyId,
    name,
    code,
    ...(createdBy && { createdBy: new mongoose.Types.ObjectId(createdBy) }),
  });
  return doc.toObject();
}

export async function createUnit(
  _companyId: string, // Kept for backward compatibility but not used
  input: { name: string; shortCode: string },
  createdBy?: string
) {
  const name = input.name?.trim();
  const shortCode = (input.shortCode?.trim() || name?.slice(0, 5) || 'U').toUpperCase().replace(/\s+/g, '');
  if (!name) throw new AppError('Unit name is required', 400);
  
  // Check for existing unit with same name (global unique)
  const existingName = await UnitOfMeasure.findOne({
    name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
  });
  if (existingName) throw new AppError('Unit name already exists', 400);
  
  // Check for existing unit with same shortCode (global unique)
  const existingCode = await UnitOfMeasure.findOne({
    shortCode: new RegExp(`^${escapeRegex(shortCode)}$`, 'i'),
  });
  if (existingCode) throw new AppError('Unit short code already in use', 400);
  
  const doc = await UnitOfMeasure.create({
    name,
    shortCode,
    isGlobal: true,
    ...(createdBy && { createdBy: new mongoose.Types.ObjectId(createdBy) }),
  });
  return doc.toObject();
}

export async function getItemGroups(companyId: string): Promise<string[]> {
  const list = await Product.distinct('itemGroup', { companyId, itemGroup: { $exists: true, $ne: '', $regex: /\S/ } });
  return (list as string[]).filter(Boolean).sort();
}

export async function getBrands(companyId: string): Promise<string[]> {
  const list = await Product.distinct('brand', { companyId, brand: { $exists: true, $ne: '', $regex: /\S/ } });
  return (list as string[]).filter(Boolean).sort();
}

export interface UpdateProductInput {
  code?: string;
  name?: string;
  imei?: string;
  itemGroup?: string;
  brand?: string;
  categoryId?: string;
  unitOfMeasureId?: string;
  retailPrice?: number;
  wholesalePrice?: number;
  purchasePrice?: number;
  specialPrice?: number;
  specialPrice2?: number;
  imageUrl?: string;
  allowBatches?: boolean;
  multiUnits?: MultiUnitInput[];
  updatedBy?: string;
}

export async function updateProduct(
  productId: string,
  companyId: string,
  input: UpdateProductInput,
  userId: string
): Promise<IProduct | null> {
  if (input.code !== undefined && input.code !== null && input.code.trim()) {
    const existing = await Product.findOne({
      companyId,
      code: new RegExp(`^${escapeRegex(input.code.trim())}$`, 'i'),
      _id: { $ne: productId },
    });
    if (existing) throw new AppError('Product code already in use', 400);
  }
  if (input.name !== undefined && input.name !== null && input.name.trim()) {
    const existing = await Product.findOne({
      companyId,
      name: new RegExp(`^${escapeRegex(input.name.trim())}$`, 'i'),
      _id: { $ne: productId },
    });
    if (existing) throw new AppError('Product name already in use', 400);
  }
  if (input.imei !== undefined && input.imei !== null && input.imei.trim()) {
    const usedByProduct = await findProductNameByImei(companyId, input.imei.trim(), productId);
    if (usedByProduct) throw new AppError(`IMEI number already present. This IMEI is used by product: ${usedByProduct}. Main IMEI and Multi Unit IMEI must be unique across all products.`, 400);
  }
  if (input.multiUnits !== undefined) {
    // Check if any multi-units being removed are used in transactions
    const currentProduct = await Product.findById(productId).select('name multiUnits imei unitOfMeasureId').lean();
    if (currentProduct?.multiUnits && currentProduct.multiUnits.length > 0) {
      const newMultiUnitIds = new Set(input.multiUnits.filter(u => u.multiUnitId).map(u => u.multiUnitId));
      const currentMultiUnits = currentProduct.multiUnits as Array<{ multiUnitId?: string; imei?: string }>;
      
      for (const existingUnit of currentMultiUnits) {
        if (existingUnit.multiUnitId && !newMultiUnitIds.has(existingUnit.multiUnitId)) {
          // This multi-unit is being removed, check if it's used in any transaction
          const isUsed = await isMultiUnitUsedInTransaction(existingUnit.multiUnitId);
          if (isUsed) {
            const errorMsg = await getMultiUnitUsageInfo(existingUnit.multiUnitId, currentProduct.name as string);
            throw new AppError(errorMsg || `Cannot delete multi-unit (IMEI: ${existingUnit.imei || 'N/A'}) as it is used in transactions.`, 400);
          }
        }
      }
    }
    
    // Validate unique units: main unit should not be same as any multi-unit's unit
    const mainUnitId = input.unitOfMeasureId !== undefined ? input.unitOfMeasureId : (currentProduct?.unitOfMeasureId?.toString() || '');
    const multiUnitIds = input.multiUnits.map((u) => u.unitId).filter(Boolean);
    if (mainUnitId && multiUnitIds.includes(mainUnitId)) {
      throw new AppError('Main product unit cannot be the same as a Multi Unit unit. Each unit must be unique.', 400);
    }
    // Check for duplicate units within multi-units
    const seenUnits = new Set<string>();
    for (const unitId of multiUnitIds) {
      if (seenUnits.has(unitId)) {
        throw new AppError('Duplicate unit in Multi Unit section. Each multi-unit must have a unique unit.', 400);
      }
      seenUnits.add(unitId);
    }
    
    const mainImeiTrim = (input.imei !== undefined && input.imei !== null ? input.imei : '').toString().trim();
    const multiImeis = input.multiUnits.map((u) => (u.imei || '').trim()).filter(Boolean);
    if (mainImeiTrim && multiImeis.includes(mainImeiTrim)) throw new AppError('IMEI number already present in Multi Unit. Use a different IMEI for main or remove it from Multi Unit.', 400);
    if (!mainImeiTrim) {
      const current = await Product.findById(productId).select('imei').lean();
      if (current?.imei && multiImeis.includes((current.imei as string).trim())) throw new AppError('IMEI number already present. Main IMEI cannot be same as a Multi Unit IMEI.', 400);
    }
    const seen = new Set<string>();
    for (const im of multiImeis) {
      if (seen.has(im)) throw new AppError(`Duplicate IMEI in Multi Unit: ${im}`, 400);
      seen.add(im);
    }
    for (const u of input.multiUnits) {
      const imeiTrim = (u.imei || '').trim();
      if (imeiTrim) {
        const usedByProduct = await findProductNameByImei(companyId, imeiTrim, productId);
        if (usedByProduct) throw new AppError(`IMEI number already present. This IMEI is used by product: ${usedByProduct}. Main IMEI and Multi Unit IMEI must be unique across all products (e.g. PROD1 main IMEI cannot be same as PROD2 Multi Unit IMEI).`, 400);
      }
    }
  }

  let imeiForUpdate: string | null | undefined = undefined;
  if (input.imei !== undefined) {
    if (input.imei?.trim()) imeiForUpdate = input.imei.trim();
    else imeiForUpdate = await getNextAutoImei(companyId);
  }

  const set: Record<string, unknown> = {
    ...(input.code !== undefined && { code: input.code.trim() }),
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(imeiForUpdate !== undefined && { imei: imeiForUpdate }),
    ...(input.itemGroup !== undefined && { itemGroup: input.itemGroup?.trim() }),
    ...(input.brand !== undefined && { brand: input.brand?.trim() }),
    ...(input.categoryId !== undefined && { categoryId: input.categoryId || null }),
    ...(input.unitOfMeasureId !== undefined && { unitOfMeasureId: input.unitOfMeasureId }),
    ...(input.retailPrice !== undefined && { retailPrice: input.retailPrice, sellingPrice: input.retailPrice }),
    ...(input.wholesalePrice !== undefined && { wholesalePrice: input.wholesalePrice, mrp: input.wholesalePrice }),
    ...(input.purchasePrice !== undefined && { purchasePrice: input.purchasePrice }),
    ...(input.specialPrice !== undefined && { specialPrice: input.specialPrice }),
    ...(input.specialPrice2 !== undefined && { specialPrice2: input.specialPrice2 }),
    ...(input.imageUrl !== undefined && { imageUrl: input.imageUrl }),
    ...(input.allowBatches !== undefined && { allowBatches: input.allowBatches }),
    ...(input.multiUnits !== undefined && {
      multiUnits: input.multiUnits.map((u) => ({
        multiUnitId: u.multiUnitId || generateMultiUnitId(),
        imei: u.imei || '',
        conversion: Number(u.conversion) || 1,
        price: Number(u.price) || 0,
        totalPrice: Number(u.totalPrice) || 0,
        unitId: u.unitId,
        wholesale: Number(u.wholesale) || 0,
        retail: Number(u.retail) || 0,
        specialPrice1: Number(u.specialPrice1) || 0,
        specialPrice2: Number(u.specialPrice2) || 0,
      })),
    }),
    updatedBy: userId,
  };

  const updated = await Product.findOneAndUpdate(
    { _id: productId, companyId },
    { $set: set },
    { new: true }
  )
    .populate('unitOfMeasureId', 'name shortCode')
    .populate('categoryId', 'name code')
    .populate('multiUnits.unitId', 'name shortCode')
    .lean() as unknown as IProduct | null;
  return updated;
}

export async function deleteProduct(productId: string, companyId: string): Promise<boolean> {
  const productObjectId = new mongoose.Types.ObjectId(productId);
  const [hasSales, hasInventory] = await Promise.all([
    SalesInvoiceItem.exists({ productId: productObjectId }),
    InventoryTransaction.exists({ productId: productObjectId }),
  ]);
  if (hasSales || hasInventory) {
    throw new AppError('Cannot delete product: it has transactions.', 400);
  }
  const result = await Product.deleteOne({ _id: productId, companyId });
  return result.deletedCount === 1;
}
