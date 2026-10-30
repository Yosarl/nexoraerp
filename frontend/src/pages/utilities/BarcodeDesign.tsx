import React, { useState, useEffect, useRef, useMemo } from 'react';
import JsBarcode from 'jsbarcode';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Switch,
  FormControlLabel,
  Slider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  IconButton,
  Paper,
  Tabs,
  Tab,
  Alert,
  Autocomplete,
  Divider,
  Checkbox,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FormatSizeIcon from '@mui/icons-material/FormatSize';
import ViewStreamIcon from '@mui/icons-material/ViewStream';
import TuneIcon from '@mui/icons-material/Tune';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import EditIcon from '@mui/icons-material/Edit';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import LocalPrintshopIcon from '@mui/icons-material/LocalPrintshop';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useAppSelector } from '../../store/hooks';
import { productApi } from '../../services/api';

// List of ALL Product Registration Fields available for Custom Footers / Dynamic Fields
export const PRODUCT_REGISTRATION_FIELDS = [
  { key: 'name', label: 'Product Name', sample: 'Fresh Milk 1L' },
  { key: 'imei', label: 'GTIN / Barcode', sample: '6291041001234' },
  { key: 'code', label: 'Product Code / SKU', sample: 'PROD-0012' },
  { key: 'retailPrice', label: 'Retail / Selling Price', sample: '12.50' },
  { key: 'wholesalePrice', label: 'Wholesale Price', sample: '10.00' },
  { key: 'specialPrice', label: 'Special Price 1', sample: '11.00' },
  { key: 'specialPrice2', label: 'Special Price 2', sample: '10.50' },
  { key: 'unit', label: 'Base Unit', sample: 'PCS' },
  { key: 'category', label: 'Category', sample: 'Dairy & Beverages' },
  { key: 'itemGroup', label: 'Item Group', sample: 'Fresh Foods' },
  { key: 'brand', label: 'Brand', sample: 'Al Rawabi' },
  { key: 'manufacturer', label: 'Manufacturer', sample: 'Al Rawabi Dairy Co.' },
  { key: 'packageUnit', label: 'Package Unit', sample: 'BOTTLE' },
  { key: 'packageSize', label: 'Package Size', sample: '1' },
  { key: 'dosageForm', label: 'Dosage Form', sample: 'LIQUID' },
  { key: 'strength', label: 'Strength', sample: '1000 ML' },
  { key: 'routeOfAdmin', label: 'Route of Admin', sample: 'ORAL' },
  { key: 'officialCode', label: 'Official / Med Code', sample: 'DDC-9921' },
  { key: 'genericName', label: 'Generic Name', sample: 'Pasteurized Whole Milk' },
  { key: 'batchNumber', label: 'Batch Number', sample: 'B2409' },
  { key: 'expiryDate', label: 'Expiry Date', sample: '31/12/2026' },
  { key: 'controlledSubstance', label: 'Controlled Substance', sample: 'None' },
  { key: 'minStockLevel', label: 'Min Stock Level', sample: '10' },
  { key: 'reorderLevel', label: 'Reorder Level', sample: '25' },
  { key: 'vatPercent', label: 'VAT Rate', sample: '5%' },
  { key: 'customText', label: 'Static Custom Text', sample: 'Inclusive of 5% VAT' },
];

export interface CustomLabelField {
  id: string;
  name: string;
  sourceType: 'product_field' | 'custom_text';
  productFieldKey: string;
  customText: string;
  prefix: string;
  suffix: string;
  fontSize: number; // pt
  bold: boolean;
  align: 'left' | 'center' | 'right';
  x: number; // mm
  y: number; // mm
  enabled: boolean;
}

export interface BarcodeDesignConfig {
  id: string;
  templateName: string;
  preset: string;
  targetPrinter: string;
  labelWidthMm: number;
  labelHeightMm: number;
  orientation: 'landscape' | 'portrait';
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  borderWidthPx: number;
  borderStyle: 'none' | 'solid' | 'dashed' | 'dotted';
  borderRadiusMm: number;
  layoutMode: 'free' | 'flow';

  company: {
    enabled: boolean;
    text: string;
    fontSize: number;
    bold: boolean;
    align: 'left' | 'center' | 'right';
    x: number;
    y: number;
  };
  productName: {
    enabled: boolean;
    fontSize: number;
    bold: boolean;
    align: 'left' | 'center' | 'right';
    maxLines: number;
    multiline?: boolean;
    x: number;
    y: number;
  };
  barcode: {
    enabled: boolean;
    format: 'CODE128' | 'EAN13' | 'CODE39' | 'UPC';
    heightMm: number;
    barWidth: number;
    showValue: boolean;
    valueFontSize: number;
    x: number;
    y: number;
  };
  price: {
    enabled: boolean;
    prefix: string;
    fontSize: number;
    bold: boolean;
    align: 'left' | 'center' | 'right';
    x: number;
    y: number;
  };
  mrp: {
    enabled: boolean;
    prefix: string;
    fontSize: number;
    bold: boolean;
    strikethrough: boolean;
    align: 'left' | 'center' | 'right';
    x: number;
    y: number;
  };

  // Multiple dynamic custom footers/fields
  customFields: CustomLabelField[];
}

const DEFAULT_TEMPLATES: Record<string, BarcodeDesignConfig> = {
  '50x25_supermarket': {
    id: '50x25_supermarket',
    templateName: '50 × 25 mm Supermarket Standard',
    preset: '50x25',
    targetPrinter: 'Default Thermal Printer',
    labelWidthMm: 50,
    labelHeightMm: 25,
    orientation: 'landscape',
    marginTopMm: 1.5,
    marginBottomMm: 1.5,
    marginLeftMm: 2,
    marginRightMm: 2,
    borderWidthPx: 0,
    borderStyle: 'none',
    borderRadiusMm: 1,
    layoutMode: 'free',
    company: {
      enabled: true,
      text: 'SUPERMARKET',
      fontSize: 7.5,
      bold: true,
      align: 'center',
      x: 2,
      y: 1.5,
    },
    productName: {
      enabled: true,
      fontSize: 8,
      bold: true,
      align: 'center',
      maxLines: 1,
      multiline: false,
      x: 2,
      y: 5.2,
    },
    barcode: {
      enabled: true,
      format: 'CODE128',
      heightMm: 8.5,
      barWidth: 1.4,
      showValue: true,
      valueFontSize: 7,
      x: 3.5,
      y: 8.8,
    },
    price: {
      enabled: true,
      prefix: 'AED ',
      fontSize: 10,
      bold: true,
      align: 'center',
      x: 25,
      y: 20,
    },
    mrp: {
      enabled: false,
      prefix: 'WAS: AED ',
      fontSize: 7,
      bold: false,
      strikethrough: true,
      align: 'left',
      x: 3,
      y: 20.5,
    },
    customFields: [
      {
        id: 'cf_vat',
        name: 'VAT Notice',
        sourceType: 'custom_text',
        productFieldKey: 'customText',
        customText: 'Inc. 5% VAT',
        prefix: '',
        suffix: '',
        fontSize: 6,
        bold: false,
        align: 'center',
        x: 2,
        y: 21.2,
        enabled: true,
      },
    ],
  },
  '38x25_small': {
    id: '38x25_small',
    templateName: '38 × 25 mm Small Retail / Jewellery',
    preset: '38x25',
    targetPrinter: 'Default Thermal Printer',
    labelWidthMm: 38,
    labelHeightMm: 25,
    orientation: 'landscape',
    marginTopMm: 1.5,
    marginBottomMm: 1.5,
    marginLeftMm: 1.5,
    marginRightMm: 1.5,
    borderWidthPx: 0,
    borderStyle: 'none',
    borderRadiusMm: 1,
    layoutMode: 'free',
    company: {
      enabled: true,
      text: 'RETAIL STORE',
      fontSize: 6.5,
      bold: true,
      align: 'center',
      x: 1.5,
      y: 1.5,
    },
    productName: {
      enabled: true,
      fontSize: 7.5,
      bold: true,
      align: 'center',
      maxLines: 1,
      multiline: false,
      x: 1.5,
      y: 4.8,
    },
    barcode: {
      enabled: true,
      format: 'CODE128',
      heightMm: 8,
      barWidth: 1.2,
      showValue: true,
      valueFontSize: 6.5,
      x: 2.5,
      y: 8.2,
    },
    price: {
      enabled: true,
      prefix: 'AED ',
      fontSize: 9,
      bold: true,
      align: 'center',
      x: 10,
      y: 19.5,
    },
    mrp: {
      enabled: false,
      prefix: 'MRP: ',
      fontSize: 6.5,
      bold: false,
      strikethrough: true,
      align: 'left',
      x: 2,
      y: 19.5,
    },
    customFields: [],
  },
  '40x30_pharma': {
    id: '40x30_pharma',
    templateName: '40 × 30 mm Pharmacy & Batch Tag',
    preset: '40x30',
    targetPrinter: 'Default Thermal Printer',
    labelWidthMm: 40,
    labelHeightMm: 30,
    orientation: 'landscape',
    marginTopMm: 1.5,
    marginBottomMm: 1.5,
    marginLeftMm: 2,
    marginRightMm: 2,
    borderWidthPx: 0,
    borderStyle: 'none',
    borderRadiusMm: 1,
    layoutMode: 'free',
    company: {
      enabled: true,
      text: 'PHARMACY CARE',
      fontSize: 7.5,
      bold: true,
      align: 'center',
      x: 2,
      y: 1.5,
    },
    productName: {
      enabled: true,
      fontSize: 8,
      bold: true,
      align: 'center',
      maxLines: 2,
      multiline: false,
      x: 2,
      y: 5.2,
    },
    barcode: {
      enabled: true,
      format: 'CODE128',
      heightMm: 9,
      barWidth: 1.3,
      showValue: true,
      valueFontSize: 7,
      x: 3,
      y: 10.5,
    },
    price: {
      enabled: true,
      prefix: 'AED ',
      fontSize: 9.5,
      bold: true,
      align: 'center',
      x: 12,
      y: 22,
    },
    mrp: {
      enabled: false,
      prefix: 'MRP: ',
      fontSize: 7,
      bold: false,
      strikethrough: true,
      align: 'left',
      x: 2,
      y: 22,
    },
    customFields: [
      {
        id: 'cf_batch',
        name: 'Batch & Expiry',
        sourceType: 'product_field',
        productFieldKey: 'batchNumber',
        customText: '',
        prefix: 'B.No: ',
        suffix: ' | Exp: 12/2026',
        fontSize: 6.5,
        bold: false,
        align: 'center',
        x: 2,
        y: 25.8,
        enabled: true,
      },
    ],
  },
  '50x50_square': {
    id: '50x50_square',
    templateName: '50 × 50 mm Square Tag',
    preset: '50x50',
    targetPrinter: 'Default Thermal Printer',
    labelWidthMm: 50,
    labelHeightMm: 50,
    orientation: 'portrait',
    marginTopMm: 2,
    marginBottomMm: 2,
    marginLeftMm: 2,
    marginRightMm: 2,
    borderWidthPx: 1,
    borderStyle: 'solid',
    borderRadiusMm: 2,
    layoutMode: 'free',
    company: {
      enabled: true,
      text: 'SUPERMARKET & GROCERY',
      fontSize: 9,
      bold: true,
      align: 'center',
      x: 2,
      y: 2,
    },
    productName: {
      enabled: true,
      fontSize: 10,
      bold: true,
      align: 'center',
      maxLines: 2,
      multiline: false,
      x: 2,
      y: 7,
    },
    barcode: {
      enabled: true,
      format: 'CODE128',
      heightMm: 14,
      barWidth: 1.6,
      showValue: true,
      valueFontSize: 8.5,
      x: 4,
      y: 16,
    },
    price: {
      enabled: true,
      prefix: 'AED ',
      fontSize: 13,
      bold: true,
      align: 'center',
      x: 15,
      y: 36,
    },
    mrp: {
      enabled: true,
      prefix: 'WAS: AED ',
      fontSize: 8.5,
      bold: false,
      strikethrough: true,
      align: 'center',
      x: 15,
      y: 32,
    },
    customFields: [
      {
        id: 'cf_fresh',
        name: 'Fresh Quality Notice',
        sourceType: 'custom_text',
        productFieldKey: 'customText',
        customText: '100% Guaranteed Fresh',
        prefix: '⭐ ',
        suffix: '',
        fontSize: 7,
        bold: true,
        align: 'center',
        x: 2,
        y: 43.5,
        enabled: true,
      },
    ],
  },
  '25x50_portrait': {
    id: '25x50_portrait',
    templateName: '25 × 50 mm (Apparel / Hangtag - Portrait)',
    preset: '25x50',
    targetPrinter: 'Default Thermal Printer',
    labelWidthMm: 25,
    labelHeightMm: 50,
    orientation: 'portrait',
    marginTopMm: 1.5,
    marginBottomMm: 1.5,
    marginLeftMm: 1.5,
    marginRightMm: 1.5,
    borderWidthPx: 0,
    borderStyle: 'none',
    borderRadiusMm: 1,
    layoutMode: 'free',
    company: {
      enabled: true,
      text: 'BOUTIQUE',
      fontSize: 6.5,
      bold: true,
      align: 'center',
      x: 1,
      y: 2,
    },
    productName: {
      enabled: true,
      fontSize: 7,
      bold: true,
      align: 'center',
      maxLines: 2,
      multiline: false,
      x: 1,
      y: 5.5,
    },
    barcode: {
      enabled: true,
      format: 'CODE128',
      heightMm: 11,
      barWidth: 1.1,
      showValue: true,
      valueFontSize: 6,
      x: 1,
      y: 13,
    },
    price: {
      enabled: true,
      prefix: 'AED ',
      fontSize: 10,
      bold: true,
      align: 'center',
      x: 2,
      y: 33,
    },
    mrp: {
      enabled: true,
      prefix: 'WAS: ',
      fontSize: 6.5,
      bold: false,
      strikethrough: true,
      align: 'center',
      x: 2,
      y: 29,
    },
    customFields: [
      {
        id: 'cf_brand',
        name: 'Brand & Unit',
        sourceType: 'product_field',
        productFieldKey: 'brand',
        customText: '',
        prefix: 'Brand: ',
        suffix: '',
        fontSize: 6,
        bold: false,
        align: 'center',
        x: 1,
        y: 39,
        enabled: true,
      },
      {
        id: 'cf_vat',
        name: 'VAT Notice',
        sourceType: 'custom_text',
        productFieldKey: 'customText',
        customText: 'Inc. 5% VAT',
        prefix: '',
        suffix: '',
        fontSize: 5.5,
        bold: false,
        align: 'center',
        x: 1,
        y: 44,
        enabled: true,
      },
    ],
  },
  '30x40_portrait': {
    id: '30x40_portrait',
    templateName: '30 × 40 mm (Bottle & Jar - Portrait)',
    preset: '30x40',
    targetPrinter: 'Default Thermal Printer',
    labelWidthMm: 30,
    labelHeightMm: 40,
    orientation: 'portrait',
    marginTopMm: 1.5,
    marginBottomMm: 1.5,
    marginLeftMm: 1.5,
    marginRightMm: 1.5,
    borderWidthPx: 0,
    borderStyle: 'none',
    borderRadiusMm: 1,
    layoutMode: 'free',
    company: {
      enabled: true,
      text: 'SUPERMARKET',
      fontSize: 7,
      bold: true,
      align: 'center',
      x: 1.5,
      y: 2,
    },
    productName: {
      enabled: true,
      fontSize: 7.5,
      bold: true,
      align: 'center',
      maxLines: 2,
      multiline: false,
      x: 1.5,
      y: 5.5,
    },
    barcode: {
      enabled: true,
      format: 'CODE128',
      heightMm: 9,
      barWidth: 1.2,
      showValue: true,
      valueFontSize: 6.5,
      x: 1.5,
      y: 13,
    },
    price: {
      enabled: true,
      prefix: 'AED ',
      fontSize: 10,
      bold: true,
      align: 'center',
      x: 3,
      y: 29,
    },
    mrp: {
      enabled: false,
      prefix: 'WAS: ',
      fontSize: 7,
      bold: false,
      strikethrough: true,
      align: 'center',
      x: 3,
      y: 26,
    },
    customFields: [
      {
        id: 'cf_batch',
        name: 'Batch & Exp',
        sourceType: 'product_field',
        productFieldKey: 'batchNumber',
        customText: '',
        prefix: 'B.No: ',
        suffix: '',
        fontSize: 6,
        bold: false,
        align: 'center',
        x: 1.5,
        y: 34.5,
        enabled: true,
      },
    ],
  },
  '25x38_small_portrait': {
    id: '25x38_small_portrait',
    templateName: '25 × 38 mm (Mini Vertical Tag - Portrait)',
    preset: '25x38',
    targetPrinter: 'Default Thermal Printer',
    labelWidthMm: 25,
    labelHeightMm: 38,
    orientation: 'portrait',
    marginTopMm: 1.5,
    marginBottomMm: 1.5,
    marginLeftMm: 1.5,
    marginRightMm: 1.5,
    borderWidthPx: 0,
    borderStyle: 'none',
    borderRadiusMm: 1,
    layoutMode: 'free',
    company: {
      enabled: true,
      text: 'STORE',
      fontSize: 6.5,
      bold: true,
      align: 'center',
      x: 1,
      y: 1.5,
    },
    productName: {
      enabled: true,
      fontSize: 6.5,
      bold: true,
      align: 'center',
      maxLines: 2,
      multiline: false,
      x: 1,
      y: 4.5,
    },
    barcode: {
      enabled: true,
      format: 'CODE128',
      heightMm: 8.5,
      barWidth: 1.1,
      showValue: true,
      valueFontSize: 6,
      x: 1,
      y: 11,
    },
    price: {
      enabled: true,
      prefix: 'AED ',
      fontSize: 9.5,
      bold: true,
      align: 'center',
      x: 1,
      y: 27,
    },
    mrp: {
      enabled: false,
      prefix: 'MRP: ',
      fontSize: 6.5,
      bold: false,
      strikethrough: true,
      align: 'center',
      x: 1,
      y: 24,
    },
    customFields: [],
  },
};

interface ProductItem {
  _id: string;
  name: string;
  code?: string;
  imei?: string;
  systemBarcode?: string;
  internationalBarcode?: string;
  retailPrice?: number;
  sellingPrice?: number;
  wholesalePrice?: number;
  mrp?: number;
  category?: string;
  categoryId?: { name?: string };
  unit?: string;
  unitOfMeasureId?: { name?: string; shortCode?: string };
  itemGroup?: string;
  brand?: string;
  manufacturer?: string;
  packageUnit?: string;
  packageSize?: string;
  dosageForm?: string;
  strength?: string;
  strengthUnit?: string;
  routeOfAdmin?: string;
  officialCode?: string;
  genericName?: string;
  batchNumber?: string;
  expiryDate?: string;
  controlledSubstance?: string;
  minStockLevel?: number;
  reorderLevel?: number;
  vatPercent?: number;
}

export function normalizeConfig(raw: any, fallbackKey = '50x25_supermarket'): BarcodeDesignConfig {
  const fallback = DEFAULT_TEMPLATES[fallbackKey] || DEFAULT_TEMPLATES['50x25_supermarket'];
  if (!raw || typeof raw !== 'object') {
    return JSON.parse(JSON.stringify(fallback));
  }

  const normalized: BarcodeDesignConfig = {
    id: String(raw.id || fallback.id || 'custom'),
    templateName: String(raw.templateName || fallback.templateName || 'Custom Template'),
    preset: String(raw.preset || fallback.preset || 'custom'),
    targetPrinter: String(raw.targetPrinter || fallback.targetPrinter || 'Default Thermal Printer'),
    labelWidthMm: Number(raw.labelWidthMm) > 0 ? Number(raw.labelWidthMm) : fallback.labelWidthMm,
    labelHeightMm: Number(raw.labelHeightMm) > 0 ? Number(raw.labelHeightMm) : fallback.labelHeightMm,
    orientation: raw.orientation === 'portrait' ? 'portrait' : 'landscape',
    marginTopMm: typeof raw.marginTopMm === 'number' ? raw.marginTopMm : fallback.marginTopMm,
    marginBottomMm: typeof raw.marginBottomMm === 'number' ? raw.marginBottomMm : fallback.marginBottomMm,
    marginLeftMm: typeof raw.marginLeftMm === 'number' ? raw.marginLeftMm : fallback.marginLeftMm,
    marginRightMm: typeof raw.marginRightMm === 'number' ? raw.marginRightMm : fallback.marginRightMm,
    borderWidthPx: typeof raw.borderWidthPx === 'number' ? raw.borderWidthPx : fallback.borderWidthPx,
    borderStyle: raw.borderStyle || fallback.borderStyle || 'none',
    borderRadiusMm: typeof raw.borderRadiusMm === 'number' ? raw.borderRadiusMm : fallback.borderRadiusMm,
    layoutMode: raw.layoutMode || fallback.layoutMode || 'free',

    company: {
      enabled: raw.company?.enabled ?? fallback.company.enabled,
      text: typeof raw.company?.text === 'string' ? raw.company.text : fallback.company.text,
      fontSize: Number(raw.company?.fontSize || fallback.company.fontSize),
      bold: Boolean(raw.company?.bold ?? fallback.company.bold),
      align: raw.company?.align || fallback.company.align,
      x: Number(raw.company?.x ?? fallback.company.x),
      y: Number(raw.company?.y ?? fallback.company.y),
    },

    productName: {
      enabled: raw.productName?.enabled ?? fallback.productName.enabled,
      fontSize: Number(raw.productName?.fontSize || fallback.productName.fontSize),
      bold: Boolean(raw.productName?.bold ?? fallback.productName.bold),
      align: raw.productName?.align || fallback.productName.align,
      maxLines: Number(raw.productName?.maxLines || fallback.productName.maxLines),
      multiline: Boolean(raw.productName?.multiline ?? fallback.productName.multiline ?? false),
      x: Number(raw.productName?.x ?? fallback.productName.x),
      y: Number(raw.productName?.y ?? fallback.productName.y),
    },

    barcode: {
      enabled: raw.barcode?.enabled ?? fallback.barcode.enabled,
      format: raw.barcode?.format || fallback.barcode.format,
      heightMm: Math.max(6, Number(raw.barcode?.heightMm || fallback.barcode.heightMm)),
      barWidth: Math.max(1.0, Math.min(3.0, Number(raw.barcode?.barWidth || fallback.barcode.barWidth))),
      showValue: raw.barcode?.showValue ?? fallback.barcode.showValue,
      valueFontSize: Number(raw.barcode?.valueFontSize || fallback.barcode.valueFontSize),
      x: Number(raw.barcode?.x ?? fallback.barcode.x),
      y: Number(raw.barcode?.y ?? fallback.barcode.y),
    },

    price: {
      enabled: raw.price?.enabled ?? fallback.price.enabled,
      prefix: typeof raw.price?.prefix === 'string' ? raw.price.prefix : fallback.price.prefix,
      fontSize: Number(raw.price?.fontSize || fallback.price.fontSize),
      bold: Boolean(raw.price?.bold ?? fallback.price.bold),
      align: raw.price?.align || fallback.price.align,
      x: Number(raw.price?.x ?? fallback.price.x),
      y: Number(raw.price?.y ?? fallback.price.y),
    },

    mrp: {
      enabled: raw.mrp?.enabled ?? fallback.mrp.enabled,
      prefix: typeof raw.mrp?.prefix === 'string' ? raw.mrp.prefix : fallback.mrp.prefix,
      fontSize: Number(raw.mrp?.fontSize || fallback.mrp.fontSize),
      bold: Boolean(raw.mrp?.bold ?? fallback.mrp.bold),
      strikethrough: Boolean(raw.mrp?.strikethrough ?? fallback.mrp.strikethrough),
      align: raw.mrp?.align || fallback.mrp.align,
      x: Number(raw.mrp?.x ?? fallback.mrp.x),
      y: Number(raw.mrp?.y ?? fallback.mrp.y),
    },

    customFields: Array.isArray(raw.customFields)
      ? raw.customFields.map((cf: any, idx: number) => ({
          id: String(cf?.id || `cf_${idx}_${Date.now()}`),
          name: String(cf?.name || `Custom Field ${idx + 1}`),
          sourceType: cf?.sourceType === 'custom_text' ? 'custom_text' : 'product_field',
          productFieldKey: String(cf?.productFieldKey || 'brand'),
          customText: String(cf?.customText || ''),
          prefix: String(cf?.prefix || ''),
          suffix: String(cf?.suffix || ''),
          fontSize: Number(cf?.fontSize || 6.5),
          bold: Boolean(cf?.bold),
          align: cf?.align || 'left',
          x: Number(cf?.x ?? 2),
          y: Number(cf?.y ?? 18),
          enabled: cf?.enabled ?? true,
        }))
      : JSON.parse(JSON.stringify(fallback.customFields || [])),
  };

  return normalized;
}

class BarcodeErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('BarcodeDesigner Error caught:', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.removeItem('barcode_designer_templates');
      localStorage.removeItem('barcode_default_printer');
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Paper
          sx={{
            p: 4,
            m: 3,
            borderRadius: 3,
            textAlign: 'center',
            maxWidth: 600,
            mx: 'auto',
            border: '1px solid #fecaca',
            bgcolor: '#fef2f2',
          }}
        >
          <Typography variant="h6" sx={{ color: '#dc2626', fontWeight: 800, mb: 1 }}>
            ⚠️ Barcode Designer Encountered an Issue
          </Typography>
          <Typography variant="body2" sx={{ color: '#7f1d1d', mb: 2 }}>
            {this.state.error?.message || 'A saved configuration could not be loaded.'}
          </Typography>
          <Button
            variant="contained"
            color="error"
            onClick={this.handleReset}
            sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
          >
            Reset to Default Templates & Reload
          </Button>
        </Paper>
      );
    }
    return this.props.children;
  }
}

export interface BarcodeScannabilityReport {
  estimatedWidthMm: number;
  totalModules: number;
  quietZoneLeftMm: number;
  quietZoneRightMm: number;
  hasEnoughQuietZone: boolean;
  isBarWidthOptimal: boolean;
  isHeightOptimal: boolean;
  status: 'optimal' | 'warning' | 'error';
  statusText: string;
  recommendation: string;
}

export function getBarcodeScannability(
  config: BarcodeDesignConfig,
  codeValue: string
): BarcodeScannabilityReport {
  const code = (codeValue || '12345678').trim();
  const format = config.barcode.format || 'CODE128';
  const barWidth = config.barcode.barWidth || 1.3;
  const heightMm = config.barcode.heightMm || 10;
  const x = config.barcode.x ?? 3;
  const labelW = config.labelWidthMm || 50;

  // Approximate module count based on symbology
  let totalModules = 100;
  if (format === 'EAN13' || format === 'UPC') {
    totalModules = 95;
  } else if (format === 'CODE39') {
    totalModules = (code.length + 2) * 15;
  } else {
    // Code 128:
    // If digits only, pairs into Code C (approx code.length / 2 symbols)
    const isAllDigits = /^\d+$/.test(code);
    const symbolCount = isAllDigits ? Math.ceil(code.length / 2) : code.length;
    totalModules = Math.max(50, symbolCount * 11 + 35);
  }

  // Single module in mm (using 3.7795 px per mm)
  const singleModuleMm = barWidth / 3.7795;
  const estimatedWidthMm = Math.round(totalModules * singleModuleMm * 10) / 10;

  const quietZoneLeftMm = Math.max(0, Math.round(x * 10) / 10);
  const quietZoneRightMm = Math.max(0, Math.round((labelW - (x + estimatedWidthMm)) * 10) / 10);

  const minQuietZone = 2.0; // mm
  const hasEnoughQuietZone = quietZoneLeftMm >= minQuietZone && quietZoneRightMm >= minQuietZone;
  const isBarWidthOptimal = barWidth >= 1.1 && barWidth <= 2.2;
  const isHeightOptimal = heightMm >= 7.0;

  let status: 'optimal' | 'warning' | 'error' = 'optimal';
  let statusText = '🟢 100% Readable by All Barcode Readers';
  let recommendation = 'Complies with ISO/GS1 standard quiet zones and optical bar density.';

  if (x + estimatedWidthMm > labelW) {
    status = 'error';
    statusText = '🔴 Barcode Overflows Label Edge!';
    recommendation = `Barcode width (${estimatedWidthMm}mm) exceeds label edge. Click 'Auto-Fit' or decrease Bar Width.`;
  } else if (barWidth < 1.0) {
    status = 'error';
    statusText = '🔴 Bar Width Too Thin for Scanners (< 1.0px)';
    recommendation = 'Thermal print heads will blur or drop narrow bars. Set bar width to at least 1.1px.';
  } else if (!hasEnoughQuietZone) {
    status = 'warning';
    statusText = '🟡 Quiet Zone Margins Too Narrow (< 2mm)';
    recommendation = 'Barcode scanners require white space on both sides to decode. Center barcode or click Auto-Fit.';
  } else if (heightMm < 6.5) {
    status = 'warning';
    statusText = '🟡 Barcode Height Low (< 6.5mm)';
    recommendation = 'Low barcode height makes handheld scanner sweep difficult. Recommended height is ≥ 8mm.';
  } else if (!isBarWidthOptimal) {
    status = 'warning';
    statusText = '🟡 Non-standard Bar Width Density';
    recommendation = 'Bar width is scannable but outside optimal 1.2–1.6px retail range.';
  }

  return {
    estimatedWidthMm,
    totalModules,
    quietZoneLeftMm,
    quietZoneRightMm,
    hasEnoughQuietZone,
    isBarWidthOptimal,
    isHeightOptimal,
    status,
    statusText,
    recommendation,
  };
}

function BarcodeDesignInner() {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);

  // Available Templates - Normalized so older saved templates never crash
  const [savedTemplates, setSavedTemplates] = useState<Record<string, BarcodeDesignConfig>>(() => {
    const defaults: Record<string, BarcodeDesignConfig> = {};
    for (const [k, v] of Object.entries(DEFAULT_TEMPLATES)) {
      defaults[k] = normalizeConfig(v, k);
    }

    try {
      const stored = localStorage.getItem('barcode_designer_templates');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object') {
          const merged: Record<string, BarcodeDesignConfig> = { ...defaults };
          for (const [k, v] of Object.entries(parsed)) {
            merged[k] = normalizeConfig(v, k);
          }
          return merged;
        }
      }
    } catch (e) {
      console.error('Failed to load saved templates', e);
    }
    return defaults;
  });

  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('50x25_supermarket');
  const [currentConfig, setCurrentConfig] = useState<BarcodeDesignConfig>(() => {
    const candidate =
      savedTemplates['50x25_supermarket'] ||
      Object.values(savedTemplates)[0] ||
      DEFAULT_TEMPLATES['50x25_supermarket'];
    return normalizeConfig(candidate);
  });

  const [zoomLevel, setZoomLevel] = useState<number>(200); // 200% default
  const [activeTab, setActiveTab] = useState<'layout' | 'content' | 'sample' | 'printer'>('layout');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Printer Detection & Profiles
  const [installedPrinters, setInstalledPrinters] = useState<string[]>([]);
  const [targetPrinter, setTargetPrinter] = useState<string>(() => {
    return localStorage.getItem('barcode_default_printer') || 'Default Thermal Printer';
  });

  // Load Installed Printers via Electron if available
  useEffect(() => {
    if (window.electronAPI?.getPrinters) {
      window.electronAPI
        .getPrinters()
        .then((printers) => {
          if (Array.isArray(printers) && printers.length > 0) {
            setInstalledPrinters(printers.map((p) => p.name || p.displayName || 'Unknown Printer'));
          }
        })
        .catch((err) => console.log('Electron getPrinters not available:', err));
    }
  }, []);

  // Products for sample preview
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);

  // Sample data representation for live preview
  const [sampleData, setSampleData] = useState<Record<string, string>>({
    name: 'Fresh Whole Milk 1L',
    imei: '6291041001234',
    code: 'PROD-0012',
    retailPrice: '7.50',
    wholesalePrice: '6.00',
    specialPrice: '7.00',
    specialPrice2: '6.80',
    unit: 'BOTTLE',
    category: 'Dairy & Milk',
    itemGroup: 'Fresh Grocery',
    brand: 'Al Rawabi',
    manufacturer: 'Al Rawabi Dairy Co.',
    packageUnit: 'BOX',
    packageSize: '1',
    dosageForm: 'LIQUID',
    strength: '1000 ML',
    routeOfAdmin: 'ORAL',
    officialCode: 'DDC-8812',
    genericName: 'Pasteurized Fresh Milk',
    batchNumber: 'B2409',
    expiryDate: '25/12/2026',
    controlledSubstance: 'None',
    minStockLevel: '10',
    reorderLevel: '25',
    vatPercent: '5%',
    customText: 'Inclusive of 5% VAT',
  });

  // Save / Rename Dialog State
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogMode, setSaveDialogMode] = useState<'save_as' | 'rename'>('save_as');
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Print Dialog State
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printCopies, setPrintCopies] = useState<number | string>(1);
  const [printPageMode, setPrintPageMode] = useState<'thermal' | 'a4_sheet' | 'a4_top_left'>('thermal');
  const [printOrientation, setPrintOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [a4Columns, setA4Columns] = useState<number | string>(3);
  const [a4Rows, setA4Rows] = useState<number | string>(8);
  const [a4SkipLabels, setA4SkipLabels] = useState<number | string>(0);

  const effectiveCopies = Math.max(1, Number(printCopies) || 1);
  const effectiveA4Cols = Math.max(1, Number(a4Columns) || 3);
  const effectiveA4Rows = Math.max(1, Number(a4Rows) || 8);
  const effectiveA4Skip = Math.max(0, Number(a4SkipLabels) || 0);

  const a4Sheets = useMemo(() => {
    if (printPageMode !== 'a4_sheet') return [];
    const capacity = effectiveA4Cols * effectiveA4Rows;
    const sheets: Array<{ placeholders: number; items: number }> = [];

    let remainingCopies = effectiveCopies;
    let isFirstSheet = true;

    while (remainingCopies > 0) {
      const placeholders = isFirstSheet ? effectiveA4Skip : 0;
      const availableSlots = Math.max(1, capacity - placeholders);
      const countThisSheet = Math.min(remainingCopies, availableSlots);
      sheets.push({ placeholders, items: countThisSheet });
      remainingCopies -= countThisSheet;
      isFirstSheet = false;
    }

    return sheets.length > 0 ? sheets : [{ placeholders: 0, items: 1 }];
  }, [printPageMode, effectiveA4Cols, effectiveA4Rows, effectiveA4Skip, effectiveCopies]);

  // SVG ref for live barcode rendering
  const barcodeSvgRef = useRef<SVGSVGElement | null>(null);
  const [barcodeRenderError, setBarcodeRenderError] = useState<string | null>(null);

  // Dragging state for interactive mouse movement in preview canvas
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    elementId: string | null;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  }>({
    isDragging: false,
    elementId: null,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
  });

  // Load products list on mount
  useEffect(() => {
    if (!companyId) return;
    productApi
      .list(companyId, { limit: 100 })
      .then((res) => {
        const list = (res.data?.data?.products || []) as ProductItem[];
        setProducts(list);
        if (list.length > 0 && !selectedProduct) {
          handleProductSelect(list[0]);
        }
      })
      .catch((err) => console.error('Error fetching products for barcode preview', err));
  }, [companyId]);

  // When a product is picked from the sample autocomplete
  const handleProductSelect = (prod: ProductItem | null) => {
    setSelectedProduct(prod);
    if (!prod) return;
    setSampleData({
      name: prod.name || '',
      imei: prod.imei || prod.systemBarcode || prod.code || '123456789012',
      code: prod.code || '',
      retailPrice: Number(prod.retailPrice ?? prod.sellingPrice ?? 0).toFixed(2),
      wholesalePrice: Number(prod.wholesalePrice ?? prod.mrp ?? 0).toFixed(2),
      specialPrice: Number((prod as any).specialPrice || 0).toFixed(2),
      specialPrice2: Number((prod as any).specialPrice2 || 0).toFixed(2),
      unit: prod.unitOfMeasureId?.name || prod.unitOfMeasureId?.shortCode || (prod as any).unit || 'PCS',
      category: prod.categoryId?.name || prod.category || '',
      itemGroup: prod.itemGroup || '',
      brand: prod.brand || '',
      manufacturer: prod.manufacturer || '',
      packageUnit: prod.packageUnit || 'BOX',
      packageSize: prod.packageSize || '1',
      dosageForm: prod.dosageForm || 'TAB',
      strength: prod.strength ? `${prod.strength} ${prod.strengthUnit || ''}`.trim() : '',
      routeOfAdmin: prod.routeOfAdmin || 'ORAL',
      officialCode: prod.officialCode || '',
      genericName: prod.genericName || '',
      batchNumber: prod.batchNumber || 'B2409',
      expiryDate: prod.expiryDate ? String(prod.expiryDate).slice(0, 10) : '31/12/2026',
      controlledSubstance: prod.controlledSubstance || 'None',
      minStockLevel: String(prod.minStockLevel || '0'),
      reorderLevel: String(prod.reorderLevel || '0'),
      vatPercent: `${prod.vatPercent || 5}%`,
      customText: 'Inclusive of 5% VAT',
    });
  };

  // Live Barcode SVG Generator using JsBarcode
  useEffect(() => {
    if (!barcodeSvgRef.current) return;
    const code = (sampleData.imei || '12345678').trim();
    if (!code) {
      setBarcodeRenderError('Please enter barcode number');
      return;
    }
    try {
      JsBarcode(barcodeSvgRef.current, code, {
        format: currentConfig.barcode.format,
        width: currentConfig.barcode.barWidth,
        height: currentConfig.barcode.heightMm * 3.7795, // 1mm ~= 3.78px
        displayValue: currentConfig.barcode.showValue,
        fontSize: currentConfig.barcode.valueFontSize * 1.33,
        margin: 0,
        textMargin: 1,
        font: 'monospace',
        fontOptions: 'bold',
      });
      setBarcodeRenderError(null);
    } catch (e: any) {
      console.warn('JsBarcode render error', e);
      setBarcodeRenderError(e?.message || 'Invalid barcode format');
    }
  }, [
    sampleData.imei,
    currentConfig.barcode.format,
    currentConfig.barcode.barWidth,
    currentConfig.barcode.heightMm,
    currentConfig.barcode.showValue,
    currentConfig.barcode.valueFontSize,
  ]);

  // Template Navigation
  const templateKeys = useMemo(() => Object.keys(savedTemplates), [savedTemplates]);
  const currentTemplateIndex = useMemo(
    () => templateKeys.indexOf(selectedTemplateKey),
    [templateKeys, selectedTemplateKey]
  );
  const hasPrevTemplate = currentTemplateIndex > 0;
  const hasNextTemplate = currentTemplateIndex < templateKeys.length - 1;

  const goToTemplateIndex = (idx: number) => {
    if (idx < 0 || idx >= templateKeys.length) return;
    const targetKey = templateKeys[idx];
    setSelectedTemplateKey(targetKey);
    setCurrentConfig(normalizeConfig(savedTemplates[targetKey], targetKey));
  };

  // Preset switching
  const handlePresetChange = (presetKey: string) => {
    if (presetKey === 'custom') {
      setCurrentConfig((prev) => ({ ...prev, preset: 'custom' }));
      return;
    }
    const target = savedTemplates[presetKey] || DEFAULT_TEMPLATES[presetKey];
    if (target) {
      setCurrentConfig(normalizeConfig(target, presetKey));
      setSelectedTemplateKey(presetKey);
    }
  };

  // Save current design changes
  const handleSaveCurrent = () => {
    // If it's a default built-in template, ask for a new name to save as custom
    if (DEFAULT_TEMPLATES[selectedTemplateKey]) {
      setSaveDialogMode('save_as');
      setTemplateNameInput(`${currentConfig.templateName} (Copy)`);
      setSaveDialogOpen(true);
      return;
    }

    const updated = {
      ...savedTemplates,
      [selectedTemplateKey]: { ...currentConfig, targetPrinter },
    };
    setSavedTemplates(updated);
    try {
      localStorage.setItem('barcode_designer_templates', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    showToast(`Saved changes to "${currentConfig.templateName}"!`);
  };

  // Save As New or Rename Template
  const handleSaveDialogConfirm = () => {
    const name = templateNameInput.trim();
    if (!name) return;

    if (saveDialogMode === 'rename') {
      const updatedConfig = { ...currentConfig, templateName: name, targetPrinter };
      const updated = { ...savedTemplates, [selectedTemplateKey]: updatedConfig };
      setSavedTemplates(updated);
      setCurrentConfig(updatedConfig);
      try {
        localStorage.setItem('barcode_designer_templates', JSON.stringify(updated));
      } catch (e) {}
      showToast(`Template renamed to "${name}"`);
    } else {
      const id = `tpl_${Date.now()}`;
      const newConfig: BarcodeDesignConfig = {
        ...currentConfig,
        id,
        templateName: name,
        targetPrinter,
      };
      const updated = { ...savedTemplates, [id]: newConfig };
      setSavedTemplates(updated);
      setSelectedTemplateKey(id);
      setCurrentConfig(newConfig);
      try {
        localStorage.setItem('barcode_designer_templates', JSON.stringify(updated));
      } catch (e) {}
      showToast(`Template "${name}" saved!`);
    }

    setSaveDialogOpen(false);
    setTemplateNameInput('');
  };

  // Delete Template
  const handleDeleteTemplate = (id: string) => {
    if (DEFAULT_TEMPLATES[id]) {
      alert('Standard system templates cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete template "${savedTemplates[id]?.templateName}"?`)) {
      return;
    }
    const updated = { ...savedTemplates };
    delete updated[id];
    setSavedTemplates(updated);
    try {
      localStorage.setItem('barcode_designer_templates', JSON.stringify(updated));
    } catch (e) {}

    const firstKey = Object.keys(updated)[0] || '50x25_supermarket';
    setSelectedTemplateKey(firstKey);
    setCurrentConfig(normalizeConfig(updated[firstKey] || DEFAULT_TEMPLATES['50x25_supermarket']));
    showToast('Template deleted');
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Orientation Presets & Toggle with automatic Dimension Swapping
  const handleSetOrientation = (newOrientation: 'landscape' | 'portrait') => {
    setCurrentConfig((prev) => {
      let w = prev.labelWidthMm;
      let h = prev.labelHeightMm;

      if (newOrientation === 'landscape' && w < h) {
        const temp = w;
        w = h;
        h = temp;
      } else if (newOrientation === 'portrait' && w > h) {
        const temp = w;
        w = h;
        h = temp;
      }

      return {
        ...prev,
        orientation: newOrientation,
        labelWidthMm: w,
        labelHeightMm: h,
      };
    });
    showToast(`Orientation set to ${newOrientation === 'portrait' ? 'Portrait (Vertical)' : 'Landscape (Horizontal)'}`);
  };

  // Swap Label Dimensions (Width ⇄ Height)
  const handleSwapDimensions = () => {
    setCurrentConfig((prev) => {
      const newW = prev.labelHeightMm;
      const newH = prev.labelWidthMm;
      const newOrientation = newW >= newH ? 'landscape' : 'portrait';
      return {
        ...prev,
        labelWidthMm: newW,
        labelHeightMm: newH,
        orientation: newOrientation,
      };
    });
    showToast('Swapped label width & height');
  };

  // Barcode Scannability Report
  const barcodeScannability = useMemo(() => {
    return getBarcodeScannability(currentConfig, sampleData.imei);
  }, [currentConfig, sampleData.imei]);

  // Adjust Barcode Width by step (safely clamped between 1.0 and 2.4)
  const handleStepBarcodeWidth = (delta: number) => {
    setCurrentConfig((prev) => {
      const current = prev.barcode.barWidth || 1.3;
      const next = Math.max(1.0, Math.min(2.4, Math.round((current + delta) * 10) / 10));
      return {
        ...prev,
        barcode: {
          ...prev.barcode,
          barWidth: next,
        },
      };
    });
  };

  // Adjust Barcode Height by step (safely clamped between 6mm and 35mm)
  const handleStepBarcodeHeight = (delta: number) => {
    setCurrentConfig((prev) => {
      const current = prev.barcode.heightMm || 10;
      const next = Math.max(6, Math.min(35, Math.round((current + delta) * 10) / 10));
      return {
        ...prev,
        barcode: {
          ...prev.barcode,
          heightMm: next,
        },
      };
    });
  };

  // Center Barcode horizontally on the label
  const handleCenterBarcode = () => {
    setCurrentConfig((prev) => {
      const rep = getBarcodeScannability(prev, sampleData.imei);
      const centeredX = Math.max(1.5, Math.round(((prev.labelWidthMm - rep.estimatedWidthMm) / 2) * 10) / 10);
      return {
        ...prev,
        barcode: {
          ...prev.barcode,
          x: centeredX,
        },
      };
    });
    showToast('Barcode centered with balanced quiet zones');
  };

  // Auto-Fit Barcode to label width with guaranteed quiet zones
  const handleAutoFitBarcode = () => {
    const code = (sampleData.imei || '12345678').trim();
    const format = currentConfig.barcode.format || 'CODE128';
    let totalModules = 100;
    if (format === 'EAN13' || format === 'UPC') {
      totalModules = 95;
    } else if (format === 'CODE39') {
      totalModules = (code.length + 2) * 15;
    } else {
      const isAllDigits = /^\d+$/.test(code);
      const symbolCount = isAllDigits ? Math.ceil(code.length / 2) : code.length;
      totalModules = Math.max(50, symbolCount * 11 + 35);
    }

    // Leave 3mm quiet zone margin on each side (total 6mm)
    const availableWidthMm = Math.max(15, currentConfig.labelWidthMm - 6);
    const calculatedBarWidth = (availableWidthMm * 3.7795) / totalModules;
    // Clamp to standard scanner-safe bar width (1.0 to 2.2)
    const safeBarWidth = Math.max(1.0, Math.min(2.2, Math.round(calculatedBarWidth * 10) / 10));

    const finalBarcodeWidthMm = (totalModules * safeBarWidth) / 3.7795;
    const centeredX = Math.max(2, Math.round(((currentConfig.labelWidthMm - finalBarcodeWidthMm) / 2) * 10) / 10);

    const safeHeight = Math.max(8, Math.min(22, Math.round(currentConfig.labelHeightMm * 0.38)));

    setCurrentConfig((prev) => ({
      ...prev,
      barcode: {
        ...prev.barcode,
        barWidth: safeBarWidth,
        heightMm: safeHeight,
        x: centeredX,
      },
    }));

    showToast(`Auto-fitted: ${safeBarWidth}x width, ${safeHeight}mm height (Scanner Ready)`);
  };

  // Apply quick density preset
  const applyBarcodeDensityPreset = (mode: 'compact' | 'standard' | 'large') => {
    if (mode === 'compact') {
      setCurrentConfig((p) => ({
        ...p,
        barcode: {
          ...p.barcode,
          barWidth: 1.1,
          heightMm: Math.max(7, Math.min(10, Math.round(p.labelHeightMm * 0.3))),
        },
      }));
      showToast('Compact density (1.1x) applied — suitable for small tags');
    } else if (mode === 'standard') {
      setCurrentConfig((p) => ({
        ...p,
        barcode: {
          ...p.barcode,
          barWidth: 1.3,
          heightMm: Math.max(9, Math.min(14, Math.round(p.labelHeightMm * 0.38))),
        },
      }));
      showToast('Standard retail density (1.3x) applied — recommended for POS');
    } else {
      setCurrentConfig((p) => ({
        ...p,
        barcode: {
          ...p.barcode,
          barWidth: 1.6,
          heightMm: Math.max(12, Math.min(22, Math.round(p.labelHeightMm * 0.45))),
        },
      }));
      showToast('Large density (1.6x) applied — fast scanning from distance');
    }
  };

  // Add a new Custom Field / Footer
  const handleAddCustomField = () => {
    const fields = currentConfig.customFields || [];
    const newId = `cf_${Date.now()}`;
    const newField: CustomLabelField = {
      id: newId,
      name: `Custom Field ${fields.length + 1}`,
      sourceType: 'product_field',
      productFieldKey: 'manufacturer',
      customText: '',
      prefix: 'Mfg: ',
      suffix: '',
      fontSize: 6.5,
      bold: false,
      align: 'left',
      x: 2,
      y: Math.min(currentConfig.labelHeightMm - 4, 18 + fields.length * 3),
      enabled: true,
    };
    setCurrentConfig((prev) => ({
      ...prev,
      customFields: [...(prev.customFields || []), newField],
    }));
    setSelectedElementId(newId);
    setActiveTab('content');
    showToast('New custom field added! You can move it with your mouse.');
  };

  // Remove a Custom Field
  const handleRemoveCustomField = (id: string) => {
    setCurrentConfig((prev) => ({
      ...prev,
      customFields: (prev.customFields || []).filter((f) => f.id !== id),
    }));
    if (selectedElementId === id) setSelectedElementId(null);
  };

  // Update a Custom Field
  const updateCustomField = (id: string, updates: Partial<CustomLabelField>) => {
    setCurrentConfig((prev) => ({
      ...prev,
      customFields: (prev.customFields || []).map((f) => (f.id === id ? { ...f, ...updates } : f)),
    }));
  };

  // Reset positions to clean vertical stack
  const handleResetToAutoLayout = () => {
    const padT = currentConfig.marginTopMm || 1.5;
    const padL = currentConfig.marginLeftMm || 2;
    let currentY = padT;

    setCurrentConfig((prev) => {
      const updated = normalizeConfig(prev);
      if (updated.company.enabled) {
        updated.company = { ...updated.company, x: padL, y: currentY };
        currentY += 4;
      }
      if (updated.productName.enabled) {
        updated.productName = { ...updated.productName, x: padL, y: currentY };
        currentY += 4.5;
      }
      if (updated.barcode.enabled) {
        updated.barcode = { ...updated.barcode, x: padL + 1, y: currentY };
        currentY += (updated.barcode.heightMm || 8) + 3.5;
      }
      if (updated.price.enabled) {
        updated.price = { ...updated.price, x: padL, y: currentY };
      }
      if (updated.mrp.enabled) {
        updated.mrp = { ...updated.mrp, x: padL + 20, y: currentY };
      }
      currentY += 4.5;

      updated.customFields = (updated.customFields || []).map((cf, idx) => ({
        ...cf,
        x: padL,
        y: Math.min(updated.labelHeightMm - 3, currentY + idx * 3.5),
      }));

      return updated;
    });
    showToast('Layout reset to clean auto alignment');
  };

  // Mouse Dragging on Label Canvas
  const handleElementMouseDown = (e: React.MouseEvent, elementId: string, initX: number, initY: number) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedElementId(elementId);

    setDragState({
      isDragging: true,
      elementId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: initX,
      initialY: initY,
    });
  };

  // Window-level mouse move and mouse up for fluid dragging
  useEffect(() => {
    if (!dragState.isDragging || !dragState.elementId) return;

    const scale = zoomLevel / 100;
    const pxPerMm = 3.7795; // 96 DPI conversion factor

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - dragState.startX) / (scale * pxPerMm);
      const deltaY = (e.clientY - dragState.startY) / (scale * pxPerMm);

      const rawNewX = dragState.initialX + deltaX;
      const rawNewY = dragState.initialY + deltaY;

      // Constrain within label bounds
      const clampedX = Math.round(Math.max(0, Math.min(currentConfig.labelWidthMm - 2, rawNewX)) * 10) / 10;
      const clampedY = Math.round(Math.max(0, Math.min(currentConfig.labelHeightMm - 2, rawNewY)) * 10) / 10;

      const id = dragState.elementId!;
      setCurrentConfig((prev) => {
        if (id === 'company') {
          return { ...prev, company: { ...prev.company, x: clampedX, y: clampedY } };
        }
        if (id === 'productName') {
          return { ...prev, productName: { ...prev.productName, x: clampedX, y: clampedY } };
        }
        if (id === 'barcode') {
          return { ...prev, barcode: { ...prev.barcode, x: clampedX, y: clampedY } };
        }
        if (id === 'price') {
          return { ...prev, price: { ...prev.price, x: clampedX, y: clampedY } };
        }
        if (id === 'mrp') {
          return { ...prev, mrp: { ...prev.mrp, x: clampedX, y: clampedY } };
        }
        // Custom fields
        return {
          ...prev,
          customFields: (prev.customFields || []).map((cf) =>
            cf.id === id ? { ...cf, x: clampedX, y: clampedY } : cf
          ),
        };
      });
    };

    const handleMouseUp = () => {
      setDragState((prev) => ({ ...prev, isDragging: false, elementId: null }));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, zoomLevel, currentConfig.labelWidthMm, currentConfig.labelHeightMm]);

  // Helper to extract value for a field key from sample data
  const getFieldValue = (key: string, customTxt: string) => {
    if (key === 'customText') return customTxt || 'Inclusive of 5% VAT';
    return sampleData[key] || '';
  };

  // Pure HTML label generator with vector SVG barcode for isolated iframe printing
  const generateSingleLabelHtmlString = (config: BarcodeDesignConfig, sample: Record<string, string>): string => {
    const norm = normalizeConfig(config);
    const {
      labelWidthMm,
      labelHeightMm,
      borderWidthPx,
      borderStyle,
      borderRadiusMm,
      company,
      productName,
      barcode,
      price,
      mrp,
      customFields,
    } = norm;

    let barcodeSvgHtml = '';
    if (barcode.enabled) {
      const code = (sample.imei || '12345678').trim();
      if (code) {
        const svgNode = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        try {
          JsBarcode(svgNode, code, {
            format: barcode.format,
            width: barcode.barWidth,
            height: barcode.heightMm * 3.7795,
            displayValue: barcode.showValue,
            fontSize: barcode.valueFontSize * 1.33,
            margin: 0,
            textMargin: 1,
            font: 'monospace',
            fontOptions: 'bold',
          });
          barcodeSvgHtml = svgNode.outerHTML;
        } catch (e) {
          barcodeSvgHtml = `<div style="font-size:7pt;color:red;">Invalid Barcode</div>`;
        }
      }
    }

    const borderCss = borderWidthPx > 0 ? `${borderWidthPx}px ${borderStyle} #000000` : 'none';

    return `
      <div class="barcode-single-label" style="
        width: ${labelWidthMm}mm;
        height: ${labelHeightMm}mm;
        border: ${borderCss};
        border-radius: ${borderRadiusMm}mm;
        box-sizing: border-box;
        background-color: #ffffff;
        color: #000000;
        position: relative;
        overflow: hidden;
        page-break-inside: avoid;
        break-inside: avoid;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        ${
          company.enabled
            ? `
          <div style="
            position: absolute;
            left: 0;
            width: 100%;
            top: ${company.y}mm;
            padding: 0 ${company.x || 2}mm;
            box-sizing: border-box;
            display: flex;
            justify-content: ${company.align === 'left' ? 'flex-start' : company.align === 'right' ? 'flex-end' : 'center'};
            align-items: center;
            overflow: hidden;
            line-height: 1.2;
          ">
            <div style="
              font-size: ${company.fontSize}pt;
              font-weight: ${company.bold ? 700 : 500};
              text-align: ${company.align || 'center'};
              text-transform: uppercase;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              letter-spacing: 0.04em;
              max-width: 100%;
            ">${company.text}</div>
          </div>
        `
            : ''
        }

        ${
          productName.enabled
            ? `
          <div style="
            position: absolute;
            left: 0;
            width: 100%;
            top: ${productName.y}mm;
            padding: 0 ${productName.x || 2}mm;
            box-sizing: border-box;
            display: flex;
            justify-content: ${productName.align === 'left' ? 'flex-start' : productName.align === 'right' ? 'flex-end' : 'center'};
            align-items: center;
            overflow: hidden;
            line-height: ${productName.multiline ? '1.15' : '1.2'};
          ">
            <div style="
              font-size: ${productName.fontSize}pt;
              font-weight: ${productName.bold ? 700 : 500};
              text-align: ${productName.align || 'center'};
              ${
                productName.multiline
                  ? `white-space: normal; word-break: break-word; overflow-wrap: break-word; width: 100%;`
                  : `overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`
              }
              max-width: 100%;
              letter-spacing: -0.01em;
            ">${sample.name || ''}</div>
          </div>
        `
            : ''
        }

        ${
          barcode.enabled
            ? `
          <div style="
            position: absolute;
            left: ${barcode.x}mm;
            top: ${barcode.y}mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          ">${barcodeSvgHtml}</div>
        `
            : ''
        }

        ${
          price.enabled
            ? `
          <div style="
            position: absolute;
            left: ${price.x}mm;
            top: ${price.y}mm;
            font-size: ${price.fontSize}pt;
            font-weight: ${price.bold ? 800 : 600};
            text-align: ${price.align};
            white-space: nowrap;
          ">${price.prefix || ''}${sample.retailPrice || '0.00'}</div>
        `
            : ''
        }

        ${
          mrp.enabled
            ? `
          <div style="
            position: absolute;
            left: ${mrp.x}mm;
            top: ${mrp.y}mm;
            font-size: ${mrp.fontSize}pt;
            font-weight: ${mrp.bold ? 700 : 400};
            text-decoration: ${mrp.strikethrough ? 'line-through' : 'none'};
            text-align: ${mrp.align};
            color: #475569;
            white-space: nowrap;
          ">${mrp.prefix || ''}${sample.wholesalePrice || '0.00'}</div>
        `
            : ''
        }

        ${(customFields || [])
          .filter((f) => f.enabled)
          .map((f) => {
            const raw = getFieldValue(f.productFieldKey, f.customText);
            const text = `${f.prefix || ''}${raw}${f.suffix || ''}`;
            return `
              <div style="
                position: absolute;
                left: 0;
                width: 100%;
                top: ${f.y}mm;
                padding: 0 ${f.x || 2}mm;
                box-sizing: border-box;
                display: flex;
                justify-content: ${f.align === 'left' ? 'flex-start' : f.align === 'right' ? 'flex-end' : 'center'};
                align-items: center;
                overflow: hidden;
                line-height: 1.2;
              ">
                <div style="
                  font-size: ${f.fontSize}pt;
                  font-weight: ${f.bold ? 700 : 400};
                  text-align: ${f.align || 'center'};
                  color: #334155;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  max-width: 100%;
                ">${text}</div>
              </div>
            `;
          })
          .join('')}
      </div>
    `;
  };

  // Execute Print via dedicated isolated hidden iframe
  const handlePrint = () => {
    setPrintDialogOpen(false);

    const singleLabelHtml = generateSingleLabelHtmlString(currentConfig, sampleData);
    let fullDocumentHtml = '';

    if (printPageMode === 'thermal') {
      fullDocumentHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Print Labels</title>
          <style>
            @page {
              size: ${currentConfig.labelWidthMm}mm ${currentConfig.labelHeightMm}mm ${printOrientation};
              margin: 0mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .thermal-page {
              width: ${currentConfig.labelWidthMm}mm;
              height: ${currentConfig.labelHeightMm}mm;
              page-break-after: always;
              break-after: page;
              overflow: hidden;
              margin: 0;
              padding: 0;
            }
            .thermal-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
          </style>
        </head>
        <body>
          ${Array.from({ length: effectiveCopies })
            .map(() => `<div class="thermal-page">${singleLabelHtml}</div>`)
            .join('')}
        </body>
        </html>
      `;
    } else if (printPageMode === 'a4_sheet') {
      // A4 Sticker Sheet Mode
      fullDocumentHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Print Labels - A4 Sheet</title>
          <style>
            @page {
              size: A4 ${printOrientation};
              margin: 8mm 6mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .a4-sheet-page {
              width: 100%;
              display: grid;
              grid-template-columns: repeat(${effectiveA4Cols}, ${currentConfig.labelWidthMm}mm);
              grid-auto-rows: ${currentConfig.labelHeightMm}mm;
              gap: 2.5mm 3mm;
              justify-content: start;
              align-content: start;
              page-break-after: always;
              break-after: page;
              box-sizing: border-box;
            }
            .a4-sheet-page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .a4-skip-slot {
              width: ${currentConfig.labelWidthMm}mm;
              height: ${currentConfig.labelHeightMm}mm;
              visibility: hidden;
            }
          </style>
        </head>
        <body>
          ${a4Sheets
            .map(
              (sheet) => `
            <div class="a4-sheet-page">
              ${Array.from({ length: sheet.placeholders }).map(() => `<div class="a4-skip-slot"></div>`).join('')}
              ${Array.from({ length: sheet.items }).map(() => singleLabelHtml).join('')}
            </div>
          `
            )
            .join('')}
        </body>
        </html>
      `;
    } else {
      // A4 Plain Paper / Top-Left
      fullDocumentHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Print Labels - A4 Top-Left</title>
          <style>
            @page {
              size: A4 ${printOrientation};
              margin: 10mm 10mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            html, body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .a4-plain-wrap {
              display: flex;
              flex-wrap: wrap;
              gap: 4mm;
              align-items: flex-start;
              justify-content: flex-start;
            }
          </style>
        </head>
        <body>
          <div class="a4-plain-wrap">
            ${Array.from({ length: effectiveCopies }).map(() => singleLabelHtml).join('')}
          </div>
        </body>
        </html>
      `;
    }

    let printIframe = document.getElementById('barcode-print-isolated-iframe') as HTMLIFrameElement;
    if (!printIframe) {
      printIframe = document.createElement('iframe');
      printIframe.id = 'barcode-print-isolated-iframe';
      printIframe.style.position = 'fixed';
      printIframe.style.right = '0';
      printIframe.style.bottom = '0';
      printIframe.style.width = '0';
      printIframe.style.height = '0';
      printIframe.style.border = '0';
      document.body.appendChild(printIframe);
    }

    const doc = printIframe.contentDocument || printIframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(fullDocumentHtml);
      doc.close();

      setTimeout(() => {
        printIframe.contentWindow?.focus();
        printIframe.contentWindow?.print();
      }, 250);
    }
  };

  // Render Label Content (Shared between Preview and Print)
  const renderLabelContent = (isPreview = false) => {
    const config = normalizeConfig(currentConfig);
    const {
      labelWidthMm,
      labelHeightMm,
      borderWidthPx,
      borderStyle,
      borderRadiusMm,
      company,
      productName,
      barcode,
      price,
      mrp,
      customFields,
    } = config;

    const renderDraggableWrapper = (
      id: string,
      x: number,
      y: number,
      content: React.ReactNode,
      align: 'left' | 'center' | 'right' = 'left'
    ) => {
      const isSelected = selectedElementId === id;
      const isBeingDragged = dragState.isDragging && dragState.elementId === id;
      const isFullRow = id === 'productName' || id === 'company' || id.startsWith('cf_');

      return (
        <div
          key={id}
          onMouseDown={(e) => isPreview && handleElementMouseDown(e, id, x, y)}
          style={{
            position: 'absolute',
            left: isFullRow ? 0 : `${x}mm`,
            top: `${y}mm`,
            width: isFullRow ? '100%' : 'auto',
            paddingLeft: isFullRow ? `${x}mm` : 0,
            paddingRight: isFullRow ? `${x}mm` : 0,
            boxSizing: 'border-box',
            display: isFullRow ? 'flex' : 'block',
            justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
            alignItems: 'center',
            cursor: isPreview ? (isBeingDragged ? 'grabbing' : 'grab') : 'default',
            userSelect: 'none',
            outline: isPreview && isSelected ? '1.5px solid #2563eb' : 'none',
            outlineOffset: '2px',
            borderRadius: '2px',
            backgroundColor: isPreview && isSelected ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
            transition: isBeingDragged ? 'none' : 'box-shadow 0.1s ease',
            boxShadow: isPreview && isBeingDragged ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
            zIndex: isBeingDragged ? 50 : isSelected ? 40 : 10,
            whiteSpace: id === 'productName' && currentConfig.productName.multiline ? 'normal' : 'nowrap',
            textAlign: align,
          }}
          title={isPreview ? `Click to select, drag with mouse to move (X: ${x}mm, Y: ${y}mm)` : undefined}
        >
          {content}
          {isPreview && isSelected && (
            <div
              style={{
                position: 'absolute',
                top: -16,
                left: 0,
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontSize: '8px',
                padding: '1px 5px',
                borderRadius: '3px',
                fontWeight: 700,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
                zIndex: 65,
              }}
            >
              {id === 'barcode'
                ? `W: ~${barcodeScannability.estimatedWidthMm}mm (${currentConfig.barcode.barWidth || 1.3}x) | H: ${currentConfig.barcode.heightMm}mm | X:${x} Y:${y}`
                : `${x}mm, ${y}mm`}
            </div>
          )}

          {/* Quick Barcode Resizing & Scannability Controls directly on Canvas when selected */}
          {isPreview && isSelected && id === 'barcode' && (
            <div
              style={{
                position: 'absolute',
                bottom: -24,
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                fontSize: '9px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                zIndex: 70,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                whiteSpace: 'nowrap',
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span style={{ color: '#94a3b8', fontSize: '8px' }}>W:</span>
              <button
                type="button"
                onClick={() => handleStepBarcodeWidth(-0.1)}
                title="Decrease bar width (-0.1)"
                disabled={(currentConfig.barcode.barWidth || 1.3) <= 1.0}
                style={{
                  cursor: (currentConfig.barcode.barWidth || 1.3) <= 1.0 ? 'not-allowed' : 'pointer',
                  background: '#334155',
                  color: '#fff',
                  border: 0,
                  borderRadius: 2,
                  padding: '1px 4px',
                  fontSize: '9px',
                  fontWeight: 'bold',
                }}
              >
                -
              </button>
              <span>{currentConfig.barcode.barWidth || 1.3}x</span>
              <button
                type="button"
                onClick={() => handleStepBarcodeWidth(0.1)}
                title="Increase bar width (+0.1)"
                disabled={(currentConfig.barcode.barWidth || 1.3) >= 2.4}
                style={{
                  cursor: (currentConfig.barcode.barWidth || 1.3) >= 2.4 ? 'not-allowed' : 'pointer',
                  background: '#334155',
                  color: '#fff',
                  border: 0,
                  borderRadius: 2,
                  padding: '1px 4px',
                  fontSize: '9px',
                  fontWeight: 'bold',
                }}
              >
                +
              </button>

              <span style={{ color: '#94a3b8', fontSize: '8px', marginLeft: 3 }}>H:</span>
              <button
                type="button"
                onClick={() => handleStepBarcodeHeight(-1)}
                title="Decrease barcode height (-1mm)"
                disabled={currentConfig.barcode.heightMm <= 6}
                style={{
                  cursor: currentConfig.barcode.heightMm <= 6 ? 'not-allowed' : 'pointer',
                  background: '#334155',
                  color: '#fff',
                  border: 0,
                  borderRadius: 2,
                  padding: '1px 4px',
                  fontSize: '9px',
                  fontWeight: 'bold',
                }}
              >
                -
              </button>
              <span>{currentConfig.barcode.heightMm}mm</span>
              <button
                type="button"
                onClick={() => handleStepBarcodeHeight(1)}
                title="Increase barcode height (+1mm)"
                disabled={currentConfig.barcode.heightMm >= 35}
                style={{
                  cursor: currentConfig.barcode.heightMm >= 35 ? 'not-allowed' : 'pointer',
                  background: '#334155',
                  color: '#fff',
                  border: 0,
                  borderRadius: 2,
                  padding: '1px 4px',
                  fontSize: '9px',
                  fontWeight: 'bold',
                }}
              >
                +
              </button>

              <button
                type="button"
                onClick={handleAutoFitBarcode}
                title="Auto-Fit width with safe quiet zones"
                style={{
                  cursor: 'pointer',
                  background: '#2563eb',
                  color: '#fff',
                  border: 0,
                  borderRadius: 2,
                  padding: '1px 5px',
                  fontSize: '9px',
                  fontWeight: 700,
                  marginLeft: 3,
                }}
              >
                ⚡ Auto-Fit
              </button>
            </div>
          )}
        </div>
      );
    };

    return (
      <div
        className="barcode-single-label"
        style={{
          width: `${labelWidthMm}mm`,
          height: `${labelHeightMm}mm`,
          border: borderWidthPx > 0 ? `${borderWidthPx}px ${borderStyle} #000000` : 'none',
          borderRadius: `${borderRadiusMm}mm`,
          boxSizing: 'border-box',
          backgroundColor: '#ffffff',
          color: '#000000',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          pageBreakInside: 'avoid',
          position: 'relative',
        }}
      >
        {/* Company Name */}
        {company.enabled &&
          renderDraggableWrapper(
            'company',
            company.x,
            company.y,
            <div
              style={{
                fontSize: `${company.fontSize}pt`,
                fontWeight: company.bold ? 700 : 500,
                textAlign: company.align || 'center',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {company.text}
            </div>,
            company.align
          )}

        {/* Product Name */}
        {productName.enabled &&
          renderDraggableWrapper(
            'productName',
            productName.x,
            productName.y,
            <div
              style={{
                fontSize: `${productName.fontSize}pt`,
                fontWeight: productName.bold ? 700 : 500,
                textAlign: productName.align || 'center',
                maxWidth: '100%',
                width: productName.multiline ? '100%' : 'auto',
                overflow: 'hidden',
                textOverflow: productName.multiline ? 'clip' : 'ellipsis',
                whiteSpace: productName.multiline ? 'normal' : 'nowrap',
                wordBreak: productName.multiline ? 'break-word' : 'normal',
                overflowWrap: productName.multiline ? 'break-word' : 'normal',
                lineHeight: productName.multiline ? 1.15 : 1.2,
                letterSpacing: '-0.01em',
              }}
            >
              {sampleData.name}
            </div>,
            productName.align
          )}

        {/* Barcode SVG */}
        {barcode.enabled &&
          renderDraggableWrapper(
            'barcode',
            barcode.x,
            barcode.y,
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {barcodeRenderError ? (
                <div style={{ fontSize: '7pt', color: 'red' }}>{barcodeRenderError}</div>
              ) : (
                <svg
                  ref={(el) => {
                    if (el) {
                      if (isPreview) {
                        barcodeSvgRef.current = el;
                      }
                      const code = (sampleData.imei || '12345678').trim();
                      if (code) {
                        try {
                          JsBarcode(el, code, {
                            format: barcode.format,
                            width: barcode.barWidth,
                            height: barcode.heightMm * 3.7795,
                            displayValue: barcode.showValue,
                            fontSize: barcode.valueFontSize * 1.33,
                            margin: 0,
                            textMargin: 1,
                            font: 'monospace',
                            fontOptions: 'bold',
                          });
                        } catch (err: any) {
                          console.warn('JsBarcode render error', err);
                        }
                      }
                    }
                  }}
                  style={{ display: 'block' }}
                />
              )}
            </div>
          )}

        {/* Selling Price */}
        {price.enabled &&
          renderDraggableWrapper(
            'price',
            price.x,
            price.y,
            <div
              style={{
                fontSize: `${price.fontSize}pt`,
                fontWeight: price.bold ? 800 : 600,
                textAlign: price.align,
              }}
            >
              {price.prefix}
              {sampleData.retailPrice}
            </div>,
            price.align
          )}

        {/* MRP / Strikethrough Price */}
        {mrp.enabled &&
          renderDraggableWrapper(
            'mrp',
            mrp.x,
            mrp.y,
            <div
              style={{
                fontSize: `${mrp.fontSize}pt`,
                fontWeight: mrp.bold ? 700 : 400,
                textDecoration: mrp.strikethrough ? 'line-through' : 'none',
                color: '#475569',
                textAlign: mrp.align,
              }}
            >
              {mrp.prefix}
              {sampleData.wholesalePrice}
            </div>,
            mrp.align
          )}

        {/* Dynamic Multiple Custom Fields / Footers */}
        {(customFields || [])
          .filter((f) => f.enabled)
          .map((f) => {
            const rawVal = getFieldValue(f.productFieldKey, f.customText);
            const displayVal = `${f.prefix || ''}${rawVal}${f.suffix || ''}`;

            return renderDraggableWrapper(
              f.id,
              f.x,
              f.y,
              <div
                style={{
                  fontSize: `${f.fontSize}pt`,
                  fontWeight: f.bold ? 700 : 400,
                  textAlign: f.align || 'center',
                  color: '#334155',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayVal}
              </div>,
              f.align
            );
          })}
      </div>
    );
  };



  return (
    <Box
      sx={{
        p: { xs: 1.5, md: 2.5 },
        bgcolor: '#f8fafc',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      {/* Toast Notification */}
      {toastMessage && (
        <Alert
          severity="success"
          icon={<CheckCircleIcon fontSize="inherit" />}
          sx={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          }}
        >
          {toastMessage}
        </Alert>
      )}

      {/* Screen Title & Top Bar */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 2.5,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          background: 'linear-gradient(to right, #ffffff, #fbfcfe)',
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
              🏷️ Barcode & Label Designer
            </Typography>
            <Chip
              label={`${currentConfig.labelWidthMm} × ${currentConfig.labelHeightMm} mm`}
              color="primary"
              size="small"
              sx={{ fontWeight: 700, borderRadius: 1.5 }}
            />
            <Chip
              icon={<span style={{ fontSize: '13px' }}>{currentConfig.orientation === 'portrait' ? '📄' : '🖼️'}</span>}
              label={currentConfig.orientation === 'portrait' ? 'Portrait' : 'Landscape'}
              size="small"
              onClick={() => handleSetOrientation(currentConfig.orientation === 'portrait' ? 'landscape' : 'portrait')}
              title="Click to toggle between Landscape and Portrait"
              sx={{
                fontWeight: 700,
                borderRadius: 1.5,
                cursor: 'pointer',
                bgcolor: '#f1f5f9',
                borderColor: '#cbd5e1',
                color: '#334155',
                border: '1px solid #cbd5e1',
                '&:hover': { bgcolor: '#e2e8f0' },
              }}
            />
          </Box>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Drag fields anywhere with your mouse, add custom product footers, set your target printer, and print.
          </Typography>
        </Box>

        {/* Action Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {/* Navigation Buttons for Saved Designs */}
          <Paper
            variant="outlined"
            sx={{
              display: 'flex',
              alignItems: 'center',
              p: 0.5,
              borderRadius: 2,
              borderColor: '#cbd5e1',
              bgcolor: '#ffffff',
            }}
          >
            <IconButton
              size="small"
              disabled={!hasPrevTemplate}
              onClick={() => goToTemplateIndex(currentTemplateIndex - 1)}
              title="Previous Saved Design"
            >
              <ArrowBackIosNewIcon fontSize="small" sx={{ fontSize: 14 }} />
            </IconButton>
            <Typography sx={{ px: 1, fontWeight: 700, fontSize: '0.82rem', color: '#1e293b' }}>
              {currentTemplateIndex + 1} / {templateKeys.length}
            </Typography>
            <IconButton
              size="small"
              disabled={!hasNextTemplate}
              onClick={() => goToTemplateIndex(currentTemplateIndex + 1)}
              title="Next Saved Design"
            >
              <ArrowForwardIosIcon fontSize="small" sx={{ fontSize: 14 }} />
            </IconButton>
          </Paper>

          {/* Preset Selector */}
          <FormControl size="small" sx={{ minWidth: 230 }}>
            <InputLabel id="template-select-label">Preset / Template</InputLabel>
            <Select
              labelId="template-select-label"
              value={selectedTemplateKey}
              label="Preset / Template"
              onChange={(e) => handlePresetChange(e.target.value)}
              sx={{ borderRadius: 2, bgcolor: '#ffffff' }}
            >
              <MenuItem disabled sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748b', bgcolor: '#f8fafc' }}>
                ── 🖼️ LANDSCAPE PRESETS ──
              </MenuItem>
              <MenuItem value="50x25_supermarket">50 × 25 mm (Supermarket - Landscape)</MenuItem>
              <MenuItem value="40x30_pharma">40 × 30 mm (Pharmacy / Shelf - Landscape)</MenuItem>
              <MenuItem value="38x25_small">38 × 25 mm (Jewellery / Tag - Landscape)</MenuItem>

              <MenuItem disabled sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748b', bgcolor: '#f8fafc' }}>
                ── 📄 PORTRAIT PRESETS ──
              </MenuItem>
              <MenuItem value="25x50_portrait">25 × 50 mm (Apparel / Hangtag - Portrait)</MenuItem>
              <MenuItem value="30x40_portrait">30 × 40 mm (Bottle / Jar - Portrait)</MenuItem>
              <MenuItem value="25x38_small_portrait">25 × 38 mm (Mini Tag - Portrait)</MenuItem>

              <MenuItem disabled sx={{ fontWeight: 800, fontSize: '0.72rem', color: '#64748b', bgcolor: '#f8fafc' }}>
                ── ⬛ SQUARE & CUSTOM ──
              </MenuItem>
              <MenuItem value="50x50_square">50 × 50 mm (Square Tag)</MenuItem>
              {Object.entries(savedTemplates)
                .filter(([k]) => !DEFAULT_TEMPLATES[k])
                .map(([k, t]) => (
                  <MenuItem key={k} value={k}>
                    ⭐ {t.templateName} ({t.orientation === 'portrait' ? 'Portrait' : 'Landscape'})
                  </MenuItem>
                ))}
              <MenuItem value="custom">✏️ Custom Dimensions...</MenuItem>
            </Select>
          </FormControl>

          {/* Edit / Rename Template Name */}
          <IconButton
            size="small"
            title="Edit / Rename Template Name"
            onClick={() => {
              setSaveDialogMode('rename');
              setTemplateNameInput(currentConfig.templateName);
              setSaveDialogOpen(true);
            }}
            sx={{ border: '1px solid #cbd5e1', borderRadius: 2, p: 0.9 }}
          >
            <EditIcon fontSize="small" />
          </IconButton>

          {/* Delete Template Button */}
          {!DEFAULT_TEMPLATES[selectedTemplateKey] && selectedTemplateKey !== 'custom' && (
            <IconButton
              size="small"
              color="error"
              title="Delete Saved Template"
              onClick={() => handleDeleteTemplate(selectedTemplateKey)}
              sx={{ bgcolor: '#fee2e2', '&:hover': { bgcolor: '#fecaca' }, borderRadius: 2, p: 0.9 }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          )}

          {/* Save Button */}
          <Button
            variant="contained"
            color="success"
            startIcon={<SaveIcon />}
            onClick={handleSaveCurrent}
            sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700, bgcolor: '#16a34a' }}
          >
            Save Design
          </Button>

          {/* Save As New Button */}
          <Button
            variant="outlined"
            onClick={() => {
              setSaveDialogMode('save_as');
              setTemplateNameInput(`${currentConfig.templateName} (Copy)`);
              setSaveDialogOpen(true);
            }}
            sx={{ textTransform: 'none', borderRadius: 2, borderColor: '#cbd5e1', color: '#334155' }}
          >
            Save As New
          </Button>

          {/* Print Button */}
          <Button
            variant="contained"
            color="primary"
            startIcon={<PrintIcon />}
            onClick={() => setPrintDialogOpen(true)}
            sx={{
              textTransform: 'none',
              borderRadius: 2,
              fontWeight: 700,
              px: 2.5,
              bgcolor: '#2563eb',
              boxShadow: '0 4px 14px rgba(37,99,235,0.3)',
              '&:hover': { bgcolor: '#1d4ed8' },
            }}
          >
            Print Labels
          </Button>
        </Box>
      </Paper>

      {/* Main Designer Grid: Controls (Left) & Canvas (Right) */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '450px 1fr' },
          gap: 2.5,
          alignItems: 'start',
        }}
      >
        {/* Left Config Panel */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            bgcolor: '#ffffff',
          }}
        >
          {/* Tabs Header */}
          <Tabs
            value={activeTab}
            onChange={(_, val) => setActiveTab(val)}
            variant="fullWidth"
            sx={{
              borderBottom: '1px solid #e2e8f0',
              bgcolor: '#f8fafc',
              '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, fontSize: '0.82rem' },
            }}
          >
            <Tab icon={<TuneIcon fontSize="small" />} iconPosition="start" label="Dimensions" value="layout" />
            <Tab icon={<ViewStreamIcon fontSize="small" />} iconPosition="start" label="Fields & Data" value="content" />
            <Tab icon={<FormatSizeIcon fontSize="small" />} iconPosition="start" label="Sample Item" value="sample" />
            <Tab icon={<LocalPrintshopIcon fontSize="small" />} iconPosition="start" label="Printer" value="printer" />
          </Tabs>

          <Box sx={{ p: 2.5, maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
            {/* TAB 1: SIZE & PAPER */}
            {activeTab === 'layout' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                    📏 Label Dimensions & Orientation
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<RestartAltIcon />}
                    onClick={handleResetToAutoLayout}
                    sx={{ textTransform: 'none', fontSize: '0.75rem' }}
                  >
                    Auto Stack
                  </Button>
                </Box>

                {/* Orientation Preset Toggle */}
                <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                      Orientation Preset
                    </Typography>
                    <Button
                      size="small"
                      variant="text"
                      onClick={handleSwapDimensions}
                      startIcon={<RestartAltIcon sx={{ transform: 'rotate(90deg)', fontSize: 16 }} />}
                      sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0.2, px: 0.8 }}
                    >
                      Swap W ⇄ H
                    </Button>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                    <Button
                      variant={currentConfig.orientation === 'landscape' ? 'contained' : 'outlined'}
                      onClick={() => handleSetOrientation('landscape')}
                      startIcon={<span>🖼️</span>}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        borderRadius: 2,
                        fontSize: '0.8rem',
                        py: 0.8,
                        bgcolor: currentConfig.orientation === 'landscape' ? '#2563eb' : '#ffffff',
                        borderColor: currentConfig.orientation === 'landscape' ? '#2563eb' : '#cbd5e1',
                        color: currentConfig.orientation === 'landscape' ? '#ffffff' : '#334155',
                        '&:hover': {
                          bgcolor: currentConfig.orientation === 'landscape' ? '#1d4ed8' : '#f1f5f9',
                        },
                      }}
                    >
                      Landscape (Horiz)
                    </Button>

                    <Button
                      variant={currentConfig.orientation === 'portrait' ? 'contained' : 'outlined'}
                      onClick={() => handleSetOrientation('portrait')}
                      startIcon={<span>📄</span>}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        borderRadius: 2,
                        fontSize: '0.8rem',
                        py: 0.8,
                        bgcolor: currentConfig.orientation === 'portrait' ? '#2563eb' : '#ffffff',
                        borderColor: currentConfig.orientation === 'portrait' ? '#2563eb' : '#cbd5e1',
                        color: currentConfig.orientation === 'portrait' ? '#ffffff' : '#334155',
                        '&:hover': {
                          bgcolor: currentConfig.orientation === 'portrait' ? '#1d4ed8' : '#f1f5f9',
                        },
                      }}
                    >
                      Portrait (Vert)
                    </Button>
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField
                    label="Width (mm)"
                    type="number"
                    size="small"
                    value={currentConfig.labelWidthMm}
                    onChange={(e) => {
                      const val = Math.max(10, Number(e.target.value));
                      setCurrentConfig((p) => ({
                        ...p,
                        labelWidthMm: val,
                        orientation: val >= p.labelHeightMm ? 'landscape' : 'portrait',
                      }));
                    }}
                    inputProps={{ min: 10, max: 200 }}
                  />
                  <TextField
                    label="Height (mm)"
                    type="number"
                    size="small"
                    value={currentConfig.labelHeightMm}
                    onChange={(e) => {
                      const val = Math.max(10, Number(e.target.value));
                      setCurrentConfig((p) => ({
                        ...p,
                        labelHeightMm: val,
                        orientation: p.labelWidthMm >= val ? 'landscape' : 'portrait',
                      }));
                    }}
                    inputProps={{ min: 10, max: 200 }}
                  />
                </Box>

                {/* Border & Radius */}
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>
                    🖼️ Border & Corner Radius
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <FormControl size="small">
                      <InputLabel>Border Style</InputLabel>
                      <Select
                        label="Border Style"
                        value={currentConfig.borderStyle}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            borderStyle: e.target.value as any,
                            borderWidthPx: e.target.value === 'none' ? 0 : 1,
                          }))
                        }
                      >
                        <MenuItem value="none">No Border</MenuItem>
                        <MenuItem value="solid">Solid Line</MenuItem>
                        <MenuItem value="dashed">Dashed Line</MenuItem>
                        <MenuItem value="dotted">Dotted Line</MenuItem>
                      </Select>
                    </FormControl>

                    <TextField
                      label="Corner Radius (mm)"
                      type="number"
                      size="small"
                      value={currentConfig.borderRadiusMm}
                      onChange={(e) => setCurrentConfig((p) => ({ ...p, borderRadiusMm: Number(e.target.value) }))}
                      inputProps={{ min: 0, max: 20 }}
                    />
                  </Box>
                </Box>

                {/* Barcode Encoding & Sizing & Scannability Advisor */}
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1e293b' }}>
                      📶 Barcode Size & Scanner Readability
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.8 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleCenterBarcode}
                        startIcon={<span>🎯</span>}
                        sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0.2, px: 0.8, borderRadius: 1.5 }}
                      >
                        Center
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={handleAutoFitBarcode}
                        startIcon={<span>⚡</span>}
                        sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0.2, px: 1, borderRadius: 1.5, bgcolor: '#2563eb' }}
                      >
                        Auto-Fit Width
                      </Button>
                    </Box>
                  </Box>

                  {/* Real-time Scanner Readability Advisor Card */}
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      mb: 2,
                      borderRadius: 2,
                      bgcolor:
                        barcodeScannability.status === 'optimal'
                          ? '#f0fdf4'
                          : barcodeScannability.status === 'warning'
                          ? '#fefce8'
                          : '#fef2f2',
                      borderColor:
                        barcodeScannability.status === 'optimal'
                          ? '#bbf7d0'
                          : barcodeScannability.status === 'warning'
                          ? '#fef08a'
                          : '#fecaca',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontWeight: 800,
                          fontSize: '0.82rem',
                          color:
                            barcodeScannability.status === 'optimal'
                              ? '#166534'
                              : barcodeScannability.status === 'warning'
                              ? '#854d0e'
                              : '#991b1b',
                        }}
                      >
                        {barcodeScannability.statusText}
                      </Typography>
                      <Chip
                        label={`~${barcodeScannability.estimatedWidthMm} mm wide`}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          bgcolor: barcodeScannability.status === 'optimal' ? '#dcfce7' : '#ffffff',
                        }}
                      />
                    </Box>
                    <Typography
                      variant="caption"
                      sx={{
                        display: 'block',
                        color:
                          barcodeScannability.status === 'optimal'
                            ? '#15803d'
                            : barcodeScannability.status === 'warning'
                            ? '#713f12'
                            : '#7f1d1d',
                        lineHeight: 1.3,
                      }}
                    >
                      {barcodeScannability.recommendation}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', mt: 0.5, color: '#64748b', fontSize: '0.7rem' }}
                    >
                      Margins: Left {barcodeScannability.quietZoneLeftMm}mm | Right {barcodeScannability.quietZoneRightMm}mm (Min 2.0mm quiet zone required by laser readers)
                    </Typography>
                  </Paper>

                  {/* Quick Barcode Density Presets */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, display: 'block', mb: 0.8 }}>
                      Quick Scanner-Friendly Size Presets:
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                      <Button
                        size="small"
                        variant={currentConfig.barcode.barWidth === 1.1 ? 'contained' : 'outlined'}
                        onClick={() => applyBarcodeDensityPreset('compact')}
                        sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0.4, borderRadius: 1.5 }}
                      >
                        🟢 Compact (1.1x)
                      </Button>
                      <Button
                        size="small"
                        variant={currentConfig.barcode.barWidth === 1.3 ? 'contained' : 'outlined'}
                        onClick={() => applyBarcodeDensityPreset('standard')}
                        sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0.4, borderRadius: 1.5, fontWeight: 700 }}
                      >
                        ⭐ Retail (1.3x)
                      </Button>
                      <Button
                        size="small"
                        variant={currentConfig.barcode.barWidth >= 1.6 ? 'contained' : 'outlined'}
                        onClick={() => applyBarcodeDensityPreset('large')}
                        sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0.4, borderRadius: 1.5 }}
                      >
                        🚀 Large (1.6x)
                      </Button>
                    </Box>
                  </Box>

                  {/* Controls Grid */}
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                    <FormControl size="small">
                      <InputLabel>Barcode Symbology</InputLabel>
                      <Select
                        label="Barcode Symbology"
                        value={currentConfig.barcode.format}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            barcode: { ...p.barcode, format: e.target.value as any },
                          }))
                        }
                      >
                        <MenuItem value="CODE128">Code 128 (Alphanumeric)</MenuItem>
                        <MenuItem value="EAN13">EAN-13 (13 digits)</MenuItem>
                        <MenuItem value="CODE39">Code 39</MenuItem>
                        <MenuItem value="UPC">UPC-A</MenuItem>
                      </Select>
                    </FormControl>

                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.2 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: '#334155' }}>
                          Bar Width: <strong>{currentConfig.barcode.barWidth || 1.3}x</strong>
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.3 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleStepBarcodeWidth(-0.1)}
                            disabled={(currentConfig.barcode.barWidth || 1.3) <= 1.0}
                            sx={{ p: 0.3, border: '1px solid #cbd5e1', borderRadius: 1 }}
                            title="Decrease width"
                          >
                            <span style={{ fontSize: 11, fontWeight: 'bold', lineHeight: 1 }}>-</span>
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleStepBarcodeWidth(0.1)}
                            disabled={(currentConfig.barcode.barWidth || 1.3) >= 2.4}
                            sx={{ p: 0.3, border: '1px solid #cbd5e1', borderRadius: 1 }}
                            title="Increase width"
                          >
                            <span style={{ fontSize: 11, fontWeight: 'bold', lineHeight: 1 }}>+</span>
                          </IconButton>
                        </Box>
                      </Box>
                      <Slider
                        size="small"
                        value={currentConfig.barcode.barWidth || 1.3}
                        min={1.0}
                        max={2.4}
                        step={0.1}
                        onChange={(_, val) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            barcode: { ...p.barcode, barWidth: Number(val) },
                          }))
                        }
                        sx={{ mt: 0.5 }}
                      />
                    </Box>
                  </Box>

                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.2 }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: '#334155' }}>
                          Height: <strong>{currentConfig.barcode.heightMm} mm</strong>
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.3 }}>
                          <IconButton
                            size="small"
                            onClick={() => handleStepBarcodeHeight(-1)}
                            disabled={currentConfig.barcode.heightMm <= 6}
                            sx={{ p: 0.3, border: '1px solid #cbd5e1', borderRadius: 1 }}
                            title="Decrease height"
                          >
                            <span style={{ fontSize: 11, fontWeight: 'bold', lineHeight: 1 }}>-</span>
                          </IconButton>
                          <IconButton
                            size="small"
                            onClick={() => handleStepBarcodeHeight(1)}
                            disabled={currentConfig.barcode.heightMm >= 35}
                            sx={{ p: 0.3, border: '1px solid #cbd5e1', borderRadius: 1 }}
                            title="Increase height"
                          >
                            <span style={{ fontSize: 11, fontWeight: 'bold', lineHeight: 1 }}>+</span>
                          </IconButton>
                        </Box>
                      </Box>
                      <Slider
                        size="small"
                        value={currentConfig.barcode.heightMm}
                        min={6}
                        max={35}
                        step={0.5}
                        onChange={(_, val) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            barcode: { ...p.barcode, heightMm: Number(val) },
                          }))
                        }
                        sx={{ mt: 0.5 }}
                      />
                    </Box>

                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      <TextField
                        label="X (mm)"
                        type="number"
                        size="small"
                        value={currentConfig.barcode.x}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            barcode: { ...p.barcode, x: Number(e.target.value) },
                          }))
                        }
                        inputProps={{ min: 0, max: 150 }}
                      />
                      <TextField
                        label="Y (mm)"
                        type="number"
                        size="small"
                        value={currentConfig.barcode.y}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            barcode: { ...p.barcode, y: Number(e.target.value) },
                          }))
                        }
                        inputProps={{ min: 0, max: 150 }}
                      />
                    </Box>
                  </Box>

                  <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={currentConfig.barcode.showValue}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              barcode: { ...p.barcode, showValue: e.target.checked },
                            }))
                          }
                        />
                      }
                      label={<Typography variant="body2" sx={{ fontSize: '0.85rem' }}>Show numbers below barcode</Typography>}
                    />
                    {currentConfig.barcode.showValue && (
                      <TextField
                        label="Font Pt"
                        type="number"
                        size="small"
                        sx={{ width: 80 }}
                        value={currentConfig.barcode.valueFontSize}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            barcode: { ...p.barcode, valueFontSize: Math.max(5, Number(e.target.value)) },
                          }))
                        }
                      />
                    )}
                  </Box>
                </Box>
              </Box>
            )}

            {/* TAB 2: FIELDS & DATA */}
            {activeTab === 'content' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ p: 1.5, bgcolor: '#eff6ff', borderRadius: 2, border: '1px solid #bfdbfe' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <DragIndicatorIcon fontSize="small" /> Interactive Visual Dragging Enabled:
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#1e3a8a', display: 'block', mt: 0.25 }}>
                    Click and drag any field on the live preview with your mouse to move it anywhere.
                  </Typography>
                </Box>

                {/* Primary Field 1: Company Name */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    borderLeft: currentConfig.company.enabled ? '4px solid #3b82f6' : '1px solid #e2e8f0',
                  }}
                >
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={currentConfig.company.enabled}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            company: { ...p.company, enabled: e.target.checked },
                          }))
                        }
                      />
                    }
                    label={<Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>Store / Company Name</Typography>}
                  />

                  {currentConfig.company.enabled && (
                    <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <TextField
                        size="small"
                        label="Store Name"
                        value={currentConfig.company.text}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            company: { ...p.company, text: e.target.value },
                          }))
                        }
                      />
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                        <TextField
                          size="small"
                          type="number"
                          label="Font Pt"
                          value={currentConfig.company.fontSize}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              company: { ...p.company, fontSize: Number(e.target.value) },
                            }))
                          }
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Side Margin / X"
                          value={currentConfig.company.x}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              company: { ...p.company, x: Number(e.target.value) },
                            }))
                          }
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Y (mm)"
                          value={currentConfig.company.y}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              company: { ...p.company, y: Number(e.target.value) },
                            }))
                          }
                        />
                      </Box>
                      <FormControl size="small" fullWidth>
                        <InputLabel>Alignment</InputLabel>
                        <Select
                          label="Alignment"
                          value={currentConfig.company.align || 'center'}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              company: { ...p.company, align: e.target.value as any },
                            }))
                          }
                        >
                          <MenuItem value="center">Center</MenuItem>
                          <MenuItem value="left">Left</MenuItem>
                          <MenuItem value="right">Right</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>
                  )}
                </Paper>

                {/* Primary Field 2: Product Name */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    borderLeft: currentConfig.productName.enabled ? '4px solid #3b82f6' : '1px solid #e2e8f0',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={currentConfig.productName.enabled}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              productName: { ...p.productName, enabled: e.target.checked },
                            }))
                          }
                        />
                      }
                      label={<Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>Product Name</Typography>}
                    />

                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={Boolean(currentConfig.productName.multiline)}
                          disabled={!currentConfig.productName.enabled}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              productName: { ...p.productName, multiline: e.target.checked },
                            }))
                          }
                          sx={{ p: 0.5 }}
                        />
                      }
                      label={
                        <Typography
                          sx={{
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            color: currentConfig.productName.enabled ? 'text.primary' : 'text.disabled',
                          }}
                        >
                          Multiline
                        </Typography>
                      }
                      sx={{ mr: 0 }}
                    />
                  </Box>

                  {currentConfig.productName.enabled && (
                    <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                        <TextField
                          size="small"
                          type="number"
                          label="Font Pt"
                          value={currentConfig.productName.fontSize}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              productName: { ...p.productName, fontSize: Number(e.target.value) },
                            }))
                          }
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Side Margin / X"
                          value={currentConfig.productName.x}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              productName: { ...p.productName, x: Number(e.target.value) },
                            }))
                          }
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Y (mm)"
                          value={currentConfig.productName.y}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              productName: { ...p.productName, y: Number(e.target.value) },
                            }))
                          }
                        />
                      </Box>
                      <FormControl size="small" fullWidth>
                        <InputLabel>Alignment</InputLabel>
                        <Select
                          label="Alignment"
                          value={currentConfig.productName.align || 'center'}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              productName: { ...p.productName, align: e.target.value as any },
                            }))
                          }
                        >
                          <MenuItem value="center">Center (Flex Both Sides)</MenuItem>
                          <MenuItem value="left">Left</MenuItem>
                          <MenuItem value="right">Right</MenuItem>
                        </Select>
                      </FormControl>
                    </Box>
                  )}
                </Paper>

                {/* Primary Field 3: Barcode Position */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    borderLeft: currentConfig.barcode.enabled ? '4px solid #6366f1' : '1px solid #e2e8f0',
                  }}
                >
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={currentConfig.barcode.enabled}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            barcode: { ...p.barcode, enabled: e.target.checked },
                          }))
                        }
                      />
                    }
                    label={<Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>Barcode Graphic</Typography>}
                  />

                  {currentConfig.barcode.enabled && (
                    <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                      {/* Scannability Status Pill */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Chip
                          label={barcodeScannability.statusText}
                          size="small"
                          sx={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            bgcolor:
                              barcodeScannability.status === 'optimal'
                                ? '#dcfce7'
                                : barcodeScannability.status === 'warning'
                                ? '#fef9c3'
                                : '#fee2e2',
                            color:
                              barcodeScannability.status === 'optimal'
                                ? '#166534'
                                : barcodeScannability.status === 'warning'
                                ? '#854d0e'
                                : '#991b1b',
                          }}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={handleAutoFitBarcode}
                          startIcon={<span>⚡</span>}
                          sx={{ textTransform: 'none', fontSize: '0.72rem', py: 0.1, px: 0.8 }}
                        >
                          Auto-Fit
                        </Button>
                      </Box>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <TextField
                          size="small"
                          type="number"
                          label="Bar Width (Density)"
                          value={currentConfig.barcode.barWidth || 1.3}
                          onChange={(e) => {
                            const val = Math.max(1.0, Math.min(2.4, Number(e.target.value)));
                            setCurrentConfig((p) => ({
                              ...p,
                              barcode: { ...p.barcode, barWidth: val },
                            }));
                          }}
                          inputProps={{ min: 1.0, max: 2.4, step: 0.1 }}
                          helperText="Min 1.0 for scanner read"
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Barcode Height (mm)"
                          value={currentConfig.barcode.heightMm}
                          onChange={(e) => {
                            const val = Math.max(6, Math.min(35, Number(e.target.value)));
                            setCurrentConfig((p) => ({
                              ...p,
                              barcode: { ...p.barcode, heightMm: val },
                            }));
                          }}
                          inputProps={{ min: 6, max: 35, step: 0.5 }}
                          helperText="Min 6mm for laser beam"
                        />
                      </Box>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                        <TextField
                          size="small"
                          type="number"
                          label="X (mm)"
                          value={currentConfig.barcode.x}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              barcode: { ...p.barcode, x: Number(e.target.value) },
                            }))
                          }
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Y (mm)"
                          value={currentConfig.barcode.y}
                          onChange={(e) =>
                            setCurrentConfig((p) => ({
                              ...p,
                              barcode: { ...p.barcode, y: Number(e.target.value) },
                            }))
                          }
                        />
                      </Box>
                    </Box>
                  )}
                </Paper>

                {/* Primary Field 4: Selling Price */}
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    borderLeft: currentConfig.price.enabled ? '4px solid #10b981' : '1px solid #e2e8f0',
                  }}
                >
                  <FormControlLabel
                    control={
                      <Switch
                        size="small"
                        checked={currentConfig.price.enabled}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            price: { ...p.price, enabled: e.target.checked },
                          }))
                        }
                      />
                    }
                    label={<Typography sx={{ fontWeight: 700, fontSize: '0.88rem' }}>Selling Price</Typography>}
                  />

                  {currentConfig.price.enabled && (
                    <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 1 }}>
                      <TextField
                        size="small"
                        label="Prefix"
                        value={currentConfig.price.prefix}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            price: { ...p.price, prefix: e.target.value },
                          }))
                        }
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="Font Pt"
                        value={currentConfig.price.fontSize}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            price: { ...p.price, fontSize: Number(e.target.value) },
                          }))
                        }
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="X (mm)"
                        value={currentConfig.price.x}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            price: { ...p.price, x: Number(e.target.value) },
                          }))
                        }
                      />
                      <TextField
                        size="small"
                        type="number"
                        label="Y (mm)"
                        value={currentConfig.price.y}
                        onChange={(e) =>
                          setCurrentConfig((p) => ({
                            ...p,
                            price: { ...p.price, y: Number(e.target.value) },
                          }))
                        }
                      />
                    </Box>
                  )}
                </Paper>

                <Divider sx={{ my: 1 }} />

                {/* DYNAMIC CUSTOM FOOTERS / PRODUCT FIELDS (USER CAN ADD MULTIPLE) */}
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#1e293b' }}>
                      📋 Custom Footers & Product Registration Fields
                    </Typography>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={handleAddCustomField}
                      sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700, fontSize: '0.78rem' }}
                    >
                      + Add Field
                    </Button>
                  </Box>

                  {(currentConfig.customFields || []).length === 0 ? (
                    <Paper
                      variant="outlined"
                      sx={{ p: 2, textAlign: 'center', borderRadius: 2, bgcolor: '#f8fafc', color: '#64748b' }}
                    >
                      <Typography variant="body2">No custom fields added yet.</Typography>
                      <Button
                        size="small"
                        onClick={handleAddCustomField}
                        startIcon={<AddIcon />}
                        sx={{ mt: 1, textTransform: 'none' }}
                      >
                        Add Custom Field / Footer
                      </Button>
                    </Paper>
                  ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {(currentConfig.customFields || []).map((cf, idx) => (
                        <Paper
                          key={cf.id}
                          variant="outlined"
                          sx={{
                            p: 1.5,
                            borderRadius: 2,
                            borderLeft: cf.enabled ? '4px solid #8b5cf6' : '1px solid #e2e8f0',
                            bgcolor: selectedElementId === cf.id ? '#f5f3ff' : '#ffffff',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <FormControlLabel
                              control={
                                <Switch
                                  size="small"
                                  checked={cf.enabled}
                                  onChange={(e) => updateCustomField(cf.id, { enabled: e.target.checked })}
                                />
                              }
                              label={
                                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem' }}>
                                  Field #{idx + 1}: {cf.name}
                                </Typography>
                              }
                            />
                            <IconButton
                              size="small"
                              color="error"
                              title="Delete this field"
                              onClick={() => handleRemoveCustomField(cf.id)}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Box>

                          {cf.enabled && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                              {/* COMBOBOX TO SELECT FROM ALL PRODUCT REGISTRATION FIELDS */}
                              <FormControl size="small" fullWidth>
                                <InputLabel>Choose Product Registration Field</InputLabel>
                                <Select
                                  label="Choose Product Registration Field"
                                  value={cf.productFieldKey}
                                  onChange={(e) => {
                                    const selectedKey = e.target.value;
                                    const matched = PRODUCT_REGISTRATION_FIELDS.find((f) => f.key === selectedKey);
                                    updateCustomField(cf.id, {
                                      productFieldKey: selectedKey,
                                      name: matched ? matched.label : 'Field',
                                      sourceType: selectedKey === 'customText' ? 'custom_text' : 'product_field',
                                    });
                                  }}
                                >
                                  {PRODUCT_REGISTRATION_FIELDS.map((f) => (
                                    <MenuItem key={f.key} value={f.key}>
                                      {f.label} <span style={{ opacity: 0.5, fontSize: '11px', marginLeft: '6px' }}>(e.g. {f.sample})</span>
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>

                              {cf.productFieldKey === 'customText' && (
                                <TextField
                                  size="small"
                                  label="Custom Static Text"
                                  value={cf.customText}
                                  onChange={(e) => updateCustomField(cf.id, { customText: e.target.value })}
                                />
                              )}

                              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                <TextField
                                  size="small"
                                  label="Prefix (e.g. 'Mfg:')"
                                  value={cf.prefix}
                                  onChange={(e) => updateCustomField(cf.id, { prefix: e.target.value })}
                                />
                                <TextField
                                  size="small"
                                  label="Suffix"
                                  value={cf.suffix}
                                  onChange={(e) => updateCustomField(cf.id, { suffix: e.target.value })}
                                />
                              </Box>

                              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
                                <TextField
                                  size="small"
                                  type="number"
                                  label="Font Pt"
                                  value={cf.fontSize}
                                  onChange={(e) => updateCustomField(cf.id, { fontSize: Number(e.target.value) })}
                                />
                                <TextField
                                  size="small"
                                  type="number"
                                  label="X (mm)"
                                  value={cf.x}
                                  onChange={(e) => updateCustomField(cf.id, { x: Number(e.target.value) })}
                                />
                                <TextField
                                  size="small"
                                  type="number"
                                  label="Y (mm)"
                                  value={cf.y}
                                  onChange={(e) => updateCustomField(cf.id, { y: Number(e.target.value) })}
                                />
                              </Box>
                            </Box>
                          )}
                        </Paper>
                      ))}
                    </Box>
                  )}
                </Box>
              </Box>
            )}

            {/* TAB 3: SAMPLE ITEM DATA */}
            {activeTab === 'sample' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                  📦 Select Inventory Item for Live Preview
                </Typography>

                {/* Autocomplete from Actual Product DB */}
                <Autocomplete
                  size="small"
                  options={products}
                  getOptionLabel={(p) => `${p.name} (${p.imei || p.systemBarcode || p.code || 'No Barcode'})`}
                  value={selectedProduct}
                  onChange={(_, val) => handleProductSelect(val)}
                  renderInput={(params) => (
                    <TextField {...params} label="Search Inventory..." placeholder="Type product name or barcode" />
                  )}
                />

                <Typography variant="caption" sx={{ color: '#64748b', mt: 1 }}>
                  The preview immediately displays all registration attributes of this selected item (Price, Barcode, Manufacturer, Unit, Batch, Category, etc.).
                </Typography>

                <TextField
                  size="small"
                  label="Product Name"
                  value={sampleData.name}
                  onChange={(e) => setSampleData((p) => ({ ...p, name: e.target.value }))}
                />

                <TextField
                  size="small"
                  label="GTIN / Barcode Value"
                  value={sampleData.imei}
                  onChange={(e) => setSampleData((p) => ({ ...p, imei: e.target.value }))}
                  helperText="Scannable barcode number"
                />

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField
                    size="small"
                    label="Selling Price"
                    value={sampleData.retailPrice}
                    onChange={(e) => setSampleData((p) => ({ ...p, retailPrice: e.target.value }))}
                  />
                  <TextField
                    size="small"
                    label="Manufacturer"
                    value={sampleData.manufacturer}
                    onChange={(e) => setSampleData((p) => ({ ...p, manufacturer: e.target.value }))}
                  />
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                  <TextField
                    size="small"
                    label="Batch Number"
                    value={sampleData.batchNumber}
                    onChange={(e) => setSampleData((p) => ({ ...p, batchNumber: e.target.value }))}
                  />
                  <TextField
                    size="small"
                    label="Expiry Date"
                    value={sampleData.expiryDate}
                    onChange={(e) => setSampleData((p) => ({ ...p, expiryDate: e.target.value }))}
                  />
                </Box>
              </Box>
            )}

            {/* TAB 4: PRINTER SETTINGS */}
            {activeTab === 'printer' && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
                  🖨️ Printer Profile & Setup
                </Typography>

                <Box sx={{ p: 2, bgcolor: '#f0fdf4', borderRadius: 2, border: '1px solid #bbf7d0' }}>
                  <Typography variant="body2" sx={{ color: '#166534', fontWeight: 600 }}>
                    Active Printer: {targetPrinter}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#15803d', display: 'block', mt: 0.5 }}>
                    You can set your thermal roll or laser printer here. It will be remembered automatically.
                  </Typography>
                </Box>

                {/* Printer Selector */}
                <FormControl size="small" fullWidth>
                  <InputLabel>Choose Printer Device</InputLabel>
                  <Select
                    label="Choose Printer Device"
                    value={targetPrinter}
                    onChange={(e) => {
                      setTargetPrinter(e.target.value);
                      localStorage.setItem('barcode_default_printer', e.target.value);
                      setCurrentConfig((prev) => ({ ...prev, targetPrinter: e.target.value }));
                      showToast(`Printer set to: ${e.target.value}`);
                    }}
                  >
                    <MenuItem value="Default Thermal Printer">Default Thermal Printer</MenuItem>
                    {installedPrinters.map((prn) => (
                      <MenuItem key={prn} value={prn}>
                        🖨️ {prn}
                      </MenuItem>
                    ))}
                    <MenuItem value="TSC Thermal Barcode Printer">TSC Thermal Barcode Printer</MenuItem>
                    <MenuItem value="Zebra ZD220 / GK420t Thermal">Zebra ZD220 / GK420t Thermal</MenuItem>
                    <MenuItem value="Xprinter XP-365B / XP-420B">Xprinter XP-365B / XP-420B</MenuItem>
                    <MenuItem value="Honeywell PC42t Desktop">Honeywell PC42t Desktop</MenuItem>
                    <MenuItem value="Brother QL Label Printer">Brother QL Label Printer</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  size="small"
                  label="Or Enter Custom Printer Name"
                  placeholder="e.g. POS-80 or USB001"
                  value={targetPrinter}
                  onChange={(e) => {
                    setTargetPrinter(e.target.value);
                    localStorage.setItem('barcode_default_printer', e.target.value);
                  }}
                  helperText="Exact Windows printer queue name"
                />

                <Button
                  variant="outlined"
                  startIcon={<LocalPrintshopIcon />}
                  onClick={() => {
                    localStorage.setItem('barcode_default_printer', targetPrinter);
                    showToast(`Default printer saved: ${targetPrinter}`);
                  }}
                  sx={{ textTransform: 'none', borderRadius: 2 }}
                >
                  Save as Default Printer
                </Button>
              </Box>
            )}
          </Box>
        </Paper>

        {/* Right Canvas / Live Preview */}
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: '1px solid #e2e8f0',
            overflow: 'hidden',
            bgcolor: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Canvas Toolbar */}
          <Box
            sx={{
              p: 1.5,
              px: 2,
              borderBottom: '1px solid #e2e8f0',
              bgcolor: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 1.5,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#334155' }}>
                👁️ Live Interactive Canvas:
              </Typography>
              <Chip
                size="small"
                label={`${currentConfig.labelWidthMm}mm × ${currentConfig.labelHeightMm}mm`}
                sx={{ fontWeight: 600, bgcolor: '#e0e7ff', color: '#3730a3' }}
              />
              <Chip
                size="small"
                label="🖱️ Drag with Mouse"
                sx={{ fontWeight: 600, bgcolor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}
              />
            </Box>

            {/* Zoom Controls */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <ZoomOutIcon
                fontSize="small"
                sx={{ color: '#64748b', cursor: 'pointer' }}
                onClick={() => setZoomLevel((z) => Math.max(75, z - 25))}
              />
              <Slider
                size="small"
                value={zoomLevel}
                min={75}
                max={300}
                step={25}
                onChange={(_, v) => setZoomLevel(v as number)}
                sx={{ width: 100 }}
              />
              <ZoomInIcon
                fontSize="small"
                sx={{ color: '#64748b', cursor: 'pointer' }}
                onClick={() => setZoomLevel((z) => Math.min(300, z + 25))}
              />
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#475569', minWidth: 40 }}>
                {zoomLevel}%
              </Typography>
            </Box>
          </Box>

          {/* Designer Canvas Viewport with Millimeter Ruler & Backdrop */}
          <Box
            ref={canvasRef}
            onClick={() => setSelectedElementId(null)}
            sx={{
              minHeight: 460,
              bgcolor: '#f1f5f9',
              backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
              backgroundSize: '16px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 4,
              overflow: 'auto',
              position: 'relative',
            }}
          >
            {/* Scaled Preview Wrapper */}
            <Box
              sx={{
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'center center',
                transition: dragState.isDragging ? 'none' : 'transform 0.15s ease-out',
                boxShadow: '0 20px 40px -15px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.06)',
                borderRadius: `${currentConfig.borderRadiusMm}mm`,
                position: 'relative',
              }}
            >
              {renderLabelContent(true)}
            </Box>
          </Box>

          {/* Canvas Bottom Information Bar */}
          <Box
            sx={{
              p: 1.5,
              px: 2,
              borderTop: '1px solid #e2e8f0',
              bgcolor: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.8rem',
              color: '#64748b',
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <div>
              Target: <strong>{targetPrinter}</strong> | Template: <strong>{currentConfig.templateName}</strong>
            </div>
            <div>
              Selected Field: <strong>{selectedElementId || 'None (click any field to move)'}</strong>
            </div>
          </Box>
        </Paper>
      </Box>

      {/* Save / Rename Template Modal */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {saveDialogMode === 'rename' ? 'Rename Barcode Template' : 'Save As New Barcode Template'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Template Name"
            placeholder="e.g. Supermarket 50x25 with Mfg"
            value={templateNameInput}
            onChange={(e) => setTemplateNameInput(e.target.value)}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveDialogConfirm} disabled={!templateNameInput.trim()}>
            {saveDialogMode === 'rename' ? 'Update Name' : 'Save Template'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Print Setup Dialog */}
      <Dialog open={printDialogOpen} onClose={() => setPrintDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
          <PrintIcon color="primary" /> Print Barcode Labels
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '28px !important', overflowY: 'visible' }}>
          {/* Top Form Fields with generous top clearance so outlined labels are never clipped */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1.2fr 1fr 1fr' }, gap: 1.5, mt: 1, overflow: 'visible' }}>
            <FormControl size="small" fullWidth sx={{ overflow: 'visible' }}>
              <InputLabel id="paper-feed-mode-label" sx={{ bgcolor: '#ffffff', px: 0.5 }}>Paper Feed Mode</InputLabel>
              <Select
                labelId="paper-feed-mode-label"
                label="Paper Feed Mode"
                value={printPageMode}
                onChange={(e) => setPrintPageMode(e.target.value as any)}
              >
                <MenuItem value="thermal">Continuous Thermal Roll</MenuItem>
                <MenuItem value="a4_sheet">A4 Sticker Sheet (Grid)</MenuItem>
                <MenuItem value="a4_top_left">A4 Plain Paper / PDF</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth sx={{ overflow: 'visible' }}>
              <InputLabel id="print-orientation-label" sx={{ bgcolor: '#ffffff', px: 0.5 }}>Print Orientation</InputLabel>
              <Select
                labelId="print-orientation-label"
                label="Print Orientation"
                value={printOrientation}
                onChange={(e) => setPrintOrientation(e.target.value as any)}
              >
                <MenuItem value="portrait">📄 Portrait</MenuItem>
                <MenuItem value="landscape">🖼️ Landscape</MenuItem>
              </Select>
            </FormControl>

            <Box sx={{ overflow: 'visible' }}>
              <TextField
                fullWidth
                size="small"
                type="number"
                label="Quantity (Labels)"
                value={printCopies}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '') {
                    setPrintCopies('');
                  } else {
                    const parsed = parseInt(val, 10);
                    setPrintCopies(isNaN(parsed) ? '' : Math.max(1, Math.min(10000, parsed)));
                  }
                }}
                onBlur={() => {
                  if (printCopies === '' || Number(printCopies) < 1) {
                    setPrintCopies(1);
                  }
                }}
                inputProps={{ min: 1, max: 10000 }}
                InputLabelProps={{ sx: { bgcolor: '#ffffff', px: 0.5 } }}
              />
              {/* Quick Preset Buttons for Label Quantity */}
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.8, flexWrap: 'wrap' }}>
                {[1, 5, 10, 20, 50, 100].map((qty) => (
                  <Chip
                    key={qty}
                    label={`${qty}`}
                    size="small"
                    variant={Number(printCopies) === qty ? 'filled' : 'outlined'}
                    color={Number(printCopies) === qty ? 'primary' : 'default'}
                    onClick={() => setPrintCopies(qty)}
                    sx={{ height: 22, fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                  />
                ))}
              </Box>
            </Box>
          </Box>

          <TextField
            size="small"
            label="Destination Printer"
            value={targetPrinter}
            onChange={(e) => setTargetPrinter(e.target.value)}
            helperText="Labels will print to this selected printer device"
            InputLabelProps={{ sx: { bgcolor: '#ffffff', px: 0.5 } }}
          />

          {printPageMode === 'a4_sheet' && (
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc', mt: 0.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: '#1e293b' }}>
                📄 A4 Sticker Sheet Grid Settings
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                <TextField
                  size="small"
                  type="number"
                  label="Columns Across"
                  value={a4Columns}
                  onChange={(e) => {
                    const val = e.target.value;
                    setA4Columns(val === '' ? '' : Math.max(1, parseInt(val, 10) || 1));
                  }}
                  onBlur={() => {
                    if (a4Columns === '' || Number(a4Columns) < 1) setA4Columns(3);
                  }}
                  inputProps={{ min: 1, max: 10 }}
                  InputLabelProps={{ sx: { bgcolor: '#f8fafc', px: 0.5 } }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Rows Down"
                  value={a4Rows}
                  onChange={(e) => {
                    const val = e.target.value;
                    setA4Rows(val === '' ? '' : Math.max(1, parseInt(val, 10) || 1));
                  }}
                  onBlur={() => {
                    if (a4Rows === '' || Number(a4Rows) < 1) setA4Rows(8);
                  }}
                  inputProps={{ min: 1, max: 30 }}
                  InputLabelProps={{ sx: { bgcolor: '#f8fafc', px: 0.5 } }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Skip Used Stickers"
                  value={a4SkipLabels}
                  onChange={(e) => {
                    const val = e.target.value;
                    setA4SkipLabels(val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
                  }}
                  onBlur={() => {
                    if (a4SkipLabels === '' || Number(a4SkipLabels) < 0) setA4SkipLabels(0);
                  }}
                  inputProps={{ min: 0, max: 100 }}
                  helperText="Start position on sheet"
                  InputLabelProps={{ sx: { bgcolor: '#f8fafc', px: 0.5 } }}
                />
              </Box>
            </Paper>
          )}

          {/* Dynamic Print Summary Card */}
          {printPageMode === 'thermal' ? (
            <Box sx={{ p: 2, bgcolor: '#f0fdf4', borderRadius: 2, border: '1px solid #bbf7d0' }}>
              <Typography variant="body2" sx={{ color: '#166534', fontWeight: 700 }}>
                🏷️ Ready to print {effectiveCopies} continuous thermal label{effectiveCopies > 1 ? 's' : ''} ({currentConfig.labelWidthMm} × {currentConfig.labelHeightMm} mm)
              </Typography>
              <Typography variant="caption" sx={{ color: '#15803d', display: 'block', mt: 0.5 }}>
                Printer: <strong>{targetPrinter}</strong>. Page size is set to {currentConfig.labelWidthMm}mm × {currentConfig.labelHeightMm}mm (ideal for thermal printers like Xprinter/Zebra).
              </Typography>
            </Box>
          ) : printPageMode === 'a4_sheet' ? (
            <Box sx={{ p: 2, bgcolor: '#eff6ff', borderRadius: 2, border: '1px solid #bfdbfe' }}>
              <Typography variant="body2" sx={{ color: '#1e40af', fontWeight: 700 }}>
                📄 Ready to print {effectiveCopies} label{effectiveCopies > 1 ? 's' : ''} on A4 Sticker Sheet ({effectiveA4Cols} cols × {effectiveA4Rows} rows = {effectiveA4Cols * effectiveA4Rows} per sheet)
              </Typography>
              <Typography variant="caption" sx={{ color: '#1d4ed8', display: 'block', mt: 0.5 }}>
                {effectiveA4Skip > 0 ? `Skipping first ${effectiveA4Skip} already-used sticker positions. ` : ''}
                Starts from top-left margin. Total A4 sheet{a4Sheets.length > 1 ? 's' : ''} required: <strong>{a4Sheets.length} page{a4Sheets.length > 1 ? 's' : ''}</strong>.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ p: 2, bgcolor: '#fef3c7', borderRadius: 2, border: '1px solid #fde68a' }}>
              <Typography variant="body2" sx={{ color: '#92400e', fontWeight: 700 }}>
                📄 Ready to print {effectiveCopies} label{effectiveCopies > 1 ? 's' : ''} on A4 Plain Paper / PDF (Top-Left Corner)
              </Typography>
              <Typography variant="caption" sx={{ color: '#b45309', display: 'block', mt: 0.5 }}>
                Labels will start from the top-left corner of the A4 page (with 10mm margins), making them easy to cut out with scissors.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPrintDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
            sx={{ px: 3, fontWeight: 700 }}
          >
            Print Now
          </Button>
        </DialogActions>
      </Dialog>


    </Box>
  );
}

export default function BarcodeDesign() {
  return (
    <BarcodeErrorBoundary>
      <BarcodeDesignInner />
    </BarcodeErrorBoundary>
  );
}
