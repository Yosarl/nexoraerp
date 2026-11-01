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
  officialCode?: string;
  genericName?: string;
  medCodeProvider?: string;
  strength?: string;
  strengthUnit?: string;
  dosageForm?: string;
  manufacturer?: string;
  packageUnit?: string;
  packageSize?: string;
  routeOfAdmin?: string;
  isControlledSubstance?: boolean;
  controlledSubstance?: string;
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

  // Parallelize duplicate checks to minimize roundtrips
  const [existingCode, existingName] = await Promise.all([
    Product.findOne({ companyId, code: new RegExp(`^${escapeRegex(codeToUse)}$`, 'i') }).select('_id').lean(),
    Product.findOne({ companyId, name: new RegExp(`^${escapeRegex(input.name.trim())}$`, 'i') }).select('_id').lean(),
  ]);
  if (existingCode) throw new AppError('Product code already in use', 400);
  if (existingName) throw new AppError('Product name already in use', 400);

  // Auto-generate IMEI if user didn't provide one
  const imeiProvided = input.imei && input.imei.trim();
  let mainImeiToUse: string;
  if (imeiProvided) {
    mainImeiToUse = input.imei!.trim();
    const usedByProduct = await findProductNameByImei(companyId, mainImeiToUse);
    if (usedByProduct) throw new AppError(`IMEI number already present. This IMEI is used by product: ${usedByProduct}. Main IMEI and Multi Unit IMEI must be unique across all products.`, 400);
  } else {
    mainImeiToUse = await getNextAutoImei(companyId);
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

  if (multiImeis.length > 0) {
    await Promise.all(
      multiImeis.map(async (im) => {
        const usedByProduct = await findProductNameByImei(companyId, im);
        if (usedByProduct) throw new AppError(`IMEI number already present. This IMEI is used by product: ${usedByProduct}. Main IMEI and Multi Unit IMEI must be unique across all products.`, 400);
      })
    );
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
    officialCode: input.officialCode?.trim(),
    genericName: input.genericName?.trim(),
    medCodeProvider: input.medCodeProvider?.trim(),
    strength: input.strength?.trim(),
    strengthUnit: input.strengthUnit?.trim(),
    dosageForm: input.dosageForm?.trim(),
    manufacturer: input.manufacturer?.trim(),
    packageUnit: input.packageUnit?.trim(),
    packageSize: input.packageSize?.trim(),
    routeOfAdmin: input.routeOfAdmin?.trim(),
    isControlledSubstance: Boolean(input.isControlledSubstance),
    controlledSubstance: input.controlledSubstance?.trim(),
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

  // Populate references directly on document without another findById roundtrip
  await product.populate([
    { path: 'unitOfMeasureId', select: 'name shortCode' },
    { path: 'categoryId', select: 'name code' },
    { path: 'multiUnits.unitId', select: 'name shortCode' },
  ]);

  return product.toObject();
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
  
  // Check if multi-unit IMEI matches
  const matchedMultiUnit = typedProduct.multiUnits?.find((mu) => {
    const muImei = mu.imei ? String(mu.imei).trim() : '';
    return muImei === trim;
  });
  if (matchedMultiUnit) {
    return { product: typedProduct, matchedMultiUnitId: matchedMultiUnit.multiUnitId };
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
  input: { name: string; code?: string },
  createdBy?: string
) {
  const name = input.name?.trim();
  if (!name) throw new AppError('Category name is required', 400);
  let code = (input.code?.trim() || name).toUpperCase().replace(/\s+/g, '_').slice(0, 30);
  let existing = await ProductCategory.findOne({
    companyId,
    code: new RegExp(`^${escapeRegex(code)}$`, 'i'),
  });
  if (existing) {
    code = `${code.slice(0, 20)}_${Date.now().toString().slice(-4)}`;
  }
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
  input: { name: string; shortCode?: string },
  createdBy?: string
) {
  const name = input.name?.trim();
  if (!name) throw new AppError('Unit name is required', 400);
  let shortCode = (input.shortCode?.trim() || name).toUpperCase().replace(/\s+/g, '').slice(0, 10);
  
  // Check for existing unit with same name (global unique)
  const existingName = await UnitOfMeasure.findOne({
    name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
  });
  if (existingName) throw new AppError('Unit name already exists', 400);
  
  // Check for existing unit with same shortCode (global unique)
  const existingCode = await UnitOfMeasure.findOne({
    shortCode: new RegExp(`^${escapeRegex(shortCode)}$`, 'i'),
  });
  if (existingCode) {
    shortCode = `${shortCode.slice(0, 5)}_${Date.now().toString().slice(-3)}`;
  }
  
  const doc = await UnitOfMeasure.create({
    name,
    shortCode,
    isGlobal: true,
    ...(createdBy && { createdBy: new mongoose.Types.ObjectId(createdBy) }),
  });
  return doc.toObject();
}

export async function checkFieldUsage(
  companyId: string,
  type: 'category' | 'unit' | 'itemGroup' | 'brand',
  identifier: string
): Promise<{
  inUse: boolean;
  hasTransactions: boolean;
  count: number;
  products: Array<{
    _id: string;
    code: string;
    name: string;
    imei: string;
    retailPrice: number;
    hasTransactions: boolean;
  }>;
}> {
  let filter: Record<string, unknown> = { companyId };
  if (type === 'category') {
    filter.categoryId = identifier;
  } else if (type === 'unit') {
    filter = {
      companyId,
      $or: [
        { unitOfMeasureId: identifier },
        { 'multiUnits.unitId': identifier }
      ]
    };
  } else if (type === 'itemGroup') {
    filter.itemGroup = identifier.trim();
  } else if (type === 'brand') {
    filter.brand = identifier.trim();
  }

  const products = await Product.find(filter)
    .select('code name imei retailPrice sellingPrice')
    .limit(50)
    .lean();

  const totalCount = await Product.countDocuments(filter);

  const productDetails = await Promise.all(
    products.map(async (p) => {
      const productObjectId = new mongoose.Types.ObjectId(String(p._id));
      const [hasSales, hasInventory] = await Promise.all([
        SalesInvoiceItem.exists({ productId: productObjectId }),
        InventoryTransaction.exists({ productId: productObjectId }),
      ]);
      return {
        _id: String(p._id),
        code: (p.code as string) || '',
        name: (p.name as string) || '',
        imei: (p.imei as string) || '',
        retailPrice: Number(p.retailPrice ?? p.sellingPrice ?? 0),
        hasTransactions: Boolean(hasSales || hasInventory),
      };
    })
  );

  return {
    inUse: totalCount > 0,
    hasTransactions: productDetails.some((p) => p.hasTransactions),
    count: totalCount,
    products: productDetails,
  };
}

export async function updateCategory(
  companyId: string,
  categoryId: string,
  input: { name?: string; code?: string },
  updatedBy?: string
) {
  const category = await ProductCategory.findOne({ _id: categoryId, companyId });
  if (!category) throw new AppError('Category not found', 404);

  const productCount = await Product.countDocuments({ companyId, categoryId });
  if (productCount > 0) {
    throw new AppError(
      `Cannot edit category "${category.name}" as it is currently assigned to ${productCount} registered product(s).`,
      400
    );
  }

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new AppError('Category name is required', 400);
    category.name = name;
  }

  if (input.code !== undefined) {
    const code = input.code.trim().toUpperCase().replace(/\s+/g, '_');
    if (!code) throw new AppError('Category code cannot be empty', 400);
    const existing = await ProductCategory.findOne({
      companyId,
      _id: { $ne: categoryId },
      code: new RegExp(`^${escapeRegex(code)}$`, 'i'),
    });
    if (existing) throw new AppError('Category code already in use', 400);
    category.code = code;
  }

  if (updatedBy) {
    (category as any).updatedBy = new mongoose.Types.ObjectId(updatedBy);
  }

  await category.save();
  return category.toObject();
}

export async function deleteCategory(companyId: string, categoryId: string) {
  const category = await ProductCategory.findOne({ _id: categoryId, companyId });
  if (!category) throw new AppError('Category not found', 404);

  const productCount = await Product.countDocuments({ companyId, categoryId });
  if (productCount > 0) {
    throw new AppError(
      `Cannot delete category "${category.name}" as it is currently assigned to ${productCount} registered product(s).`,
      400
    );
  }

  await ProductCategory.deleteOne({ _id: categoryId, companyId });
  return { success: true, message: 'Category deleted successfully' };
}

export async function updateUnit(
  unitId: string,
  input: { name?: string; shortCode?: string },
  updatedBy?: string
) {
  const unit = await UnitOfMeasure.findById(unitId);
  if (!unit) throw new AppError('Unit not found', 404);

  const productCount = await Product.countDocuments({
    $or: [{ unitOfMeasureId: unitId }, { 'multiUnits.unitId': unitId }],
  });
  if (productCount > 0) {
    throw new AppError(
      `Cannot edit unit "${unit.name || unit.shortCode}" as it is currently assigned to ${productCount} registered product(s).`,
      400
    );
  }

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new AppError('Unit name is required', 400);
    const existingName = await UnitOfMeasure.findOne({
      _id: { $ne: unitId },
      name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    });
    if (existingName) throw new AppError('Unit name already exists', 400);
    unit.name = name;
  }

  if (input.shortCode !== undefined) {
    const shortCode = input.shortCode.trim().toUpperCase().replace(/\s+/g, '');
    if (!shortCode) throw new AppError('Unit short code cannot be empty', 400);
    const existingCode = await UnitOfMeasure.findOne({
      _id: { $ne: unitId },
      shortCode: new RegExp(`^${escapeRegex(shortCode)}$`, 'i'),
    });
    if (existingCode) throw new AppError('Unit short code already in use', 400);
    unit.shortCode = shortCode;
  }

  if (updatedBy) {
    unit.updatedBy = new mongoose.Types.ObjectId(updatedBy);
  }

  await unit.save();
  return unit.toObject();
}

export async function deleteUnit(unitId: string) {
  const unit = await UnitOfMeasure.findById(unitId);
  if (!unit) throw new AppError('Unit not found', 404);

  const productCount = await Product.countDocuments({
    $or: [{ unitOfMeasureId: unitId }, { 'multiUnits.unitId': unitId }],
  });
  if (productCount > 0) {
    throw new AppError(
      `Cannot delete unit "${unit.name || unit.shortCode}" as it is currently assigned to ${productCount} registered product(s).`,
      400
    );
  }

  await UnitOfMeasure.findByIdAndDelete(unitId);
  return { success: true, message: 'Unit deleted successfully' };
}

export async function getItemGroups(companyId: string): Promise<string[]> {
  const list = await Product.distinct('itemGroup', { companyId, itemGroup: { $exists: true, $ne: '', $regex: /\S/ } });
  return (list as string[]).filter(Boolean).sort();
}

export async function updateItemGroup(companyId: string, oldName: string, newName: string) {
  const trimmedOld = (oldName || '').trim();
  const trimmedNew = (newName || '').trim();
  if (!trimmedOld || !trimmedNew) throw new AppError('Old and new item group names are required', 400);

  const productCount = await Product.countDocuments({ companyId, itemGroup: trimmedOld });
  if (productCount > 0) {
    throw new AppError(
      `Cannot edit item group "${trimmedOld}" as it is currently assigned to ${productCount} registered product(s).`,
      400
    );
  }

  const result = await Product.updateMany(
    { companyId, itemGroup: trimmedOld },
    { $set: { itemGroup: trimmedNew } }
  );
  return { success: true, modifiedCount: result.modifiedCount };
}

export async function deleteItemGroup(companyId: string, name: string) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new AppError('Item group name is required', 400);

  const productCount = await Product.countDocuments({ companyId, itemGroup: trimmed });
  if (productCount > 0) {
    throw new AppError(
      `Cannot delete item group "${trimmed}" as it is currently assigned to ${productCount} registered product(s).`,
      400
    );
  }

  const result = await Product.updateMany(
    { companyId, itemGroup: trimmed },
    { $unset: { itemGroup: 1 } }
  );
  return { success: true, modifiedCount: result.modifiedCount };
}

export async function getBrands(companyId: string): Promise<string[]> {
  const list = await Product.distinct('brand', { companyId, brand: { $exists: true, $ne: '', $regex: /\S/ } });
  return (list as string[]).filter(Boolean).sort();
}

export async function updateBrand(companyId: string, oldName: string, newName: string) {
  const trimmedOld = (oldName || '').trim();
  const trimmedNew = (newName || '').trim();
  if (!trimmedOld || !trimmedNew) throw new AppError('Old and new brand names are required', 400);

  const productCount = await Product.countDocuments({ companyId, brand: trimmedOld });
  if (productCount > 0) {
    throw new AppError(
      `Cannot edit brand "${trimmedOld}" as it is currently assigned to ${productCount} registered product(s).`,
      400
    );
  }

  const result = await Product.updateMany(
    { companyId, brand: trimmedOld },
    { $set: { brand: trimmedNew } }
  );
  return { success: true, modifiedCount: result.modifiedCount };
}

export async function deleteBrand(companyId: string, name: string) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new AppError('Brand name is required', 400);

  const productCount = await Product.countDocuments({ companyId, brand: trimmed });
  if (productCount > 0) {
    throw new AppError(
      `Cannot delete brand "${trimmed}" as it is currently assigned to ${productCount} registered product(s).`,
      400
    );
  }

  const result = await Product.updateMany(
    { companyId, brand: trimmed },
    { $unset: { brand: 1 } }
  );
  return { success: true, modifiedCount: result.modifiedCount };
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
  officialCode?: string;
  genericName?: string;
  medCodeProvider?: string;
  strength?: string;
  strengthUnit?: string;
  dosageForm?: string;
  manufacturer?: string;
  packageUnit?: string;
  packageSize?: string;
  routeOfAdmin?: string;
  isControlledSubstance?: boolean;
  controlledSubstance?: string;
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
    ...(input.officialCode !== undefined && { officialCode: input.officialCode?.trim() }),
    ...(input.genericName !== undefined && { genericName: input.genericName?.trim() }),
    ...(input.medCodeProvider !== undefined && { medCodeProvider: input.medCodeProvider?.trim() }),
    ...(input.strength !== undefined && { strength: input.strength?.trim() }),
    ...(input.strengthUnit !== undefined && { strengthUnit: input.strengthUnit?.trim() }),
    ...(input.dosageForm !== undefined && { dosageForm: input.dosageForm?.trim() }),
    ...(input.manufacturer !== undefined && { manufacturer: input.manufacturer?.trim() }),
    ...(input.packageUnit !== undefined && { packageUnit: input.packageUnit?.trim() }),
    ...(input.packageSize !== undefined && { packageSize: input.packageSize?.trim() }),
    ...(input.routeOfAdmin !== undefined && { routeOfAdmin: input.routeOfAdmin?.trim() }),
    ...(input.isControlledSubstance !== undefined && { isControlledSubstance: Boolean(input.isControlledSubstance) }),
    ...(input.controlledSubstance !== undefined && { controlledSubstance: input.controlledSubstance?.trim() }),
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
