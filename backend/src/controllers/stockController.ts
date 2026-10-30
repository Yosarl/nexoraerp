import { Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth';
import * as stockService from '../services/stockService';

export async function getStockReport(
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
    const opts = {
      search: req.query.search as string,
      searchField: req.query.searchField as string,
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      mode: (req.query.mode as string) || 'avg',
    };
    const data = await stockService.getStockReport(companyId, opts);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getProductStock(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const productId = req.params.productId;
    if (!companyId || !productId) {
      res.status(400).json({ success: false, message: 'Company ID and Product ID required' });
      return;
    }
    const stock = await stockService.getProductStock(companyId, productId);
    res.json({ success: true, data: { stock } });
  } catch (err) {
    next(err);
  }
}

export async function getStockMovement(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = (req.query.companyId as string) || '';
    if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
      res.json({
        success: true,
        data: {
          items: [],
          summary: {
            totalOpening: 0,
            totalPurchase: 0,
            totalReturn: 0,
            totalStockAdjPlus: 0,
            totalStockAdjMinus: 0,
            totalDamage: 0,
            totalQty: 0,
            totalStockValue: 0,
            count: 0,
          },
        },
      });
      return;
    }
    const cleanStr = (val: unknown): string | undefined => {
      if (typeof val !== 'string') return undefined;
      const t = val.trim();
      if (!t || t === 'undefined' || t === 'null') return undefined;
      return t;
    };
    const opts = {
      financialYearId: cleanStr(req.query.financialYearId),
      productId: cleanStr(req.query.productId),
      fromDate: cleanStr(req.query.fromDate),
      toDate: cleanStr(req.query.toDate),
      type: cleanStr(req.query.type),
      category: cleanStr(req.query.category),
      brand: cleanStr(req.query.brand),
      search: cleanStr(req.query.search),
    };
    const data = await stockService.getStockMovement(companyId, opts);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getProductTransactions(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const companyId = req.query.companyId as string;
    const productId = req.params.productId;
    if (!companyId || !productId) {
      res.status(400).json({ success: false, message: 'Company ID and Product ID required' });
      return;
    }
    const cleanStr = (val: unknown): string | undefined => {
      if (typeof val !== 'string') return undefined;
      const t = val.trim();
      if (!t || t === 'undefined' || t === 'null') return undefined;
      return t;
    };
    const opts = {
      fromDate: cleanStr(req.query.fromDate),
      toDate: cleanStr(req.query.toDate),
      type: cleanStr(req.query.type),
      financialYearId: cleanStr(req.query.financialYearId),
    };
    const data = await stockService.getProductTransactions(companyId, productId, opts);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}



