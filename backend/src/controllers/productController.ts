import { Response, NextFunction } from 'express';
import { body, param, query } from 'express-validator';
import { AuthRequest } from '../middlewares/auth';
import * as productService from '../services/productService';
import { validate } from '../middlewares/validate';

export const createProductValidators = [
  body('companyId').notEmpty().withMessage('Company ID is required'),
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('unitOfMeasureId').notEmpty().withMessage('Unit of measure is required'),
];

export async function createProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!._id.toString();
    const data = await productService.createProduct({ ...req.body, createdBy: userId });
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function list(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const search = req.query.search as string | undefined;
    const categoryId = req.query.categoryId as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const result = await productService.list(companyId, { search, categoryId, page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getByBarcode(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const barcode = req.query.barcode as string;
    if (!companyId || !barcode) {
      res.status(400).json({ success: false, message: 'Company ID and barcode required' });
      return;
    }
    const data = await productService.findByBarcode(companyId, barcode);
    if (!data) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getById(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const productId = req.params.id;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await productService.getById(productId, companyId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function checkFieldUsage(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const type = req.query.type as 'category' | 'unit' | 'itemGroup' | 'brand';
    const identifier = req.query.identifier as string;
    if (!companyId || !type || !identifier) {
      res.status(400).json({ success: false, message: 'companyId, type, and identifier are required' });
      return;
    }
    const data = await productService.checkFieldUsage(companyId, type, identifier);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getUnits(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await productService.getUnitOfMeasures(companyId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getCategories(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await productService.getCategories(companyId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export const createCategoryValidators = [
  body('companyId').notEmpty().withMessage('Company ID required'),
  body('name').trim().notEmpty().withMessage('Category name is required'),
  body('code').optional().trim(),
];

export async function createCategory(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = (req.body.companyId || req.query.companyId) as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const userId = req.user?._id?.toString();
    const data = await productService.createCategory(
      companyId,
      { name: req.body.name, code: req.body.code ?? req.body.name },
      userId
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateCategory(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = (req.body.companyId || req.query.companyId) as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const { id } = req.params;
    const userId = req.user?._id?.toString();
    const data = await productService.updateCategory(
      companyId,
      id,
      { name: req.body.name, code: req.body.code },
      userId
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteCategory(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = (req.body.companyId || req.query.companyId) as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const { id } = req.params;
    const data = await productService.deleteCategory(companyId, id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export const createUnitValidators = [
  body('companyId').notEmpty().withMessage('Company ID required'),
  body('name').trim().notEmpty().withMessage('Unit name is required'),
  body('shortCode').optional().trim(),
];

export async function createUnit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = (req.body.companyId || req.query.companyId) as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const userId = req.user?._id?.toString();
    const data = await productService.createUnit(
      companyId,
      { name: req.body.name, shortCode: req.body.shortCode ?? req.body.name },
      userId
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateUnit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user?._id?.toString();
    const data = await productService.updateUnit(
      id,
      { name: req.body.name, shortCode: req.body.shortCode },
      userId
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteUnit(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const data = await productService.deleteUnit(id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getItemGroups(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await productService.getItemGroups(companyId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateItemGroup(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = (req.body.companyId || req.query.companyId) as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const { oldName, newName } = req.body;
    const data = await productService.updateItemGroup(companyId, oldName, newName);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteItemGroup(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = (req.body.companyId || req.query.companyId) as string;
    const name = (req.body.name || req.query.name) as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await productService.deleteItemGroup(companyId, name);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getBrands(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await productService.getBrands(companyId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateBrand(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = (req.body.companyId || req.query.companyId) as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const { oldName, newName } = req.body;
    const data = await productService.updateBrand(companyId, oldName, newName);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function deleteBrand(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = (req.body.companyId || req.query.companyId) as string;
    const name = (req.body.name || req.query.name) as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const data = await productService.deleteBrand(companyId, name);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getNextCode(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const code = await productService.getNextProductCode(companyId);
    res.json({ success: true, data: { code } });
  } catch (err) {
    next(err);
  }
}

export async function getByImei(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const imei = req.query.imei as string;
    if (!companyId || !imei) {
      res.status(400).json({ success: false, message: 'Company ID and IMEI required' });
      return;
    }
    const data = await productService.findByImei(companyId, imei);
    if (!data) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const productId = req.params.id;
    const companyId = (req.query.companyId || req.body.companyId) as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const userId = req.user!._id.toString();
    const data = await productService.updateProduct(productId, companyId, req.body, userId);
    if (!data) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function uploadProductImage(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ success: false, message: 'No image file uploaded' });
      return;
    }
    const url = `/uploads/products/${companyId}/${req.file.filename}`;
    res.json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}

export async function deleteProduct(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const productId = req.params.id;
    const companyId = req.query.companyId as string;
    if (!companyId) {
      res.status(400).json({ success: false, message: 'Company ID required' });
      return;
    }
    const deleted = await productService.deleteProduct(productId, companyId);
    if (!deleted) {
      res.status(404).json({ success: false, message: 'Product not found' });
      return;
    }
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    next(err);
  }
}
