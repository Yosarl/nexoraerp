import JsBarcode from 'jsbarcode';

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

export const DEFAULT_TEMPLATES: Record<string, BarcodeDesignConfig> = {
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
      heightMm: Number(raw.barcode?.heightMm || fallback.barcode.heightMm),
      barWidth: Number(raw.barcode?.barWidth || fallback.barcode.barWidth),
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

/**
 * Load all templates (built-in default templates merged with user-saved custom templates in localStorage)
 */
export function loadAllBarcodeTemplates(): Record<string, BarcodeDesignConfig> {
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
    console.error('Failed to load barcode designer templates:', e);
  }
  return defaults;
}

const DEFAULT_PURCHASE_TEMPLATE_KEY = 'barcode_default_purchase_template';

export function getDefaultPurchaseBarcodeTemplate(allTemplates: Record<string, BarcodeDesignConfig>): string {
  try {
    const saved = localStorage.getItem(DEFAULT_PURCHASE_TEMPLATE_KEY);
    if (saved && allTemplates[saved]) {
      return saved;
    }
  } catch {
    // fallback
  }
  if (allTemplates['50x25_supermarket']) return '50x25_supermarket';
  return Object.keys(allTemplates)[0] || '50x25_supermarket';
}

export function setDefaultPurchaseBarcodeTemplate(templateKey: string): void {
  try {
    localStorage.setItem(DEFAULT_PURCHASE_TEMPLATE_KEY, templateKey);
  } catch (e) {
    console.error('Failed to save default purchase template:', e);
  }
}

/**
 * Pure HTML label generator with vector SVG barcode for isolated iframe printing
 */
export function generateSingleLabelHtmlString(
  config: BarcodeDesignConfig,
  sample: Record<string, string>
): string {
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
    const code = (sample.imei || sample.code || '12345678').trim();
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
        barcodeSvgHtml = `<div style="font-size:7pt;color:red;font-weight:bold;">${code}</div>`;
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
          const raw = f.productFieldKey === 'customText' ? (f.customText || 'Inclusive of 5% VAT') : (sample[f.productFieldKey] || '');
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
}

export type PaperFeedMode = 'thermal' | 'a4_sheet' | 'a4_top_left';

export const DEFAULT_PURCHASE_PAPER_FEED_MODE_KEY = 'barcode_default_paper_feed_mode';

export function getDefaultPaperFeedMode(): PaperFeedMode {
  try {
    const saved = localStorage.getItem(DEFAULT_PURCHASE_PAPER_FEED_MODE_KEY);
    if (saved === 'thermal' || saved === 'a4_sheet' || saved === 'a4_top_left') {
      return saved as PaperFeedMode;
    }
  } catch {
    // fallback
  }
  return 'thermal';
}

export function setDefaultPaperFeedMode(mode: PaperFeedMode): void {
  try {
    localStorage.setItem(DEFAULT_PURCHASE_PAPER_FEED_MODE_KEY, mode);
  } catch (e) {
    console.error('Failed to save default paper feed mode:', e);
  }
}

/**
 * Builds the printable HTML document and sends it to the isolated hidden iframe for printing
 */
export function executePrintBarcodeDocument(
  config: BarcodeDesignConfig,
  labelHtmlList: string[],
  orientationOverride?: 'landscape' | 'portrait',
  feedMode: PaperFeedMode = 'thermal',
  options?: {
    a4Columns?: number;
    a4Rows?: number;
    a4SkipLabels?: number;
  }
): void {
  const norm = normalizeConfig(config);
  const orientation = orientationOverride || norm.orientation || 'landscape';

  let fullDocumentHtml = '';

  if (feedMode === 'thermal') {
    fullDocumentHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Print Barcode Labels</title>
        <style>
          @page {
            size: ${norm.labelWidthMm}mm ${norm.labelHeightMm}mm ${orientation};
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
            width: ${norm.labelWidthMm}mm;
            height: ${norm.labelHeightMm}mm;
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
        ${labelHtmlList.map((html) => `<div class="thermal-page">${html}</div>`).join('')}
      </body>
      </html>
    `;
  } else if (feedMode === 'a4_sheet') {
    const a4Cols = Math.max(1, Number(options?.a4Columns) || Math.max(1, Math.floor(195 / (norm.labelWidthMm || 50))));
    const a4Rows = Math.max(1, Number(options?.a4Rows) || Math.max(1, Math.floor(280 / (norm.labelHeightMm || 25))));
    const skipSlots = Math.max(0, Number(options?.a4SkipLabels) || 0);
    const capacity = a4Cols * a4Rows;

    const sheets: Array<{ placeholders: number; items: string[] }> = [];
    const remainingLabels = [...labelHtmlList];
    let isFirstSheet = true;

    while (remainingLabels.length > 0) {
      const placeholders = isFirstSheet ? skipSlots : 0;
      const availableSlots = Math.max(1, capacity - placeholders);
      const countThisSheet = Math.min(remainingLabels.length, availableSlots);
      const sheetLabels = remainingLabels.splice(0, countThisSheet);
      sheets.push({ placeholders, items: sheetLabels });
      isFirstSheet = false;
    }

    if (sheets.length === 0) {
      sheets.push({ placeholders: 0, items: [] });
    }

    fullDocumentHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Print Labels - A4 Sheet</title>
        <style>
          @page {
            size: A4 ${orientation};
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
            grid-template-columns: repeat(${a4Cols}, ${norm.labelWidthMm}mm);
            grid-auto-rows: ${norm.labelHeightMm}mm;
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
            width: ${norm.labelWidthMm}mm;
            height: ${norm.labelHeightMm}mm;
            visibility: hidden;
          }
        </style>
      </head>
      <body>
        ${sheets
          .map(
            (sheet) => `
          <div class="a4-sheet-page">
            ${Array.from({ length: sheet.placeholders }).map(() => `<div class="a4-skip-slot"></div>`).join('')}
            ${sheet.items.join('')}
          </div>
        `
          )
          .join('')}
      </body>
      </html>
    `;
  } else {
    // a4_top_left
    fullDocumentHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Print Labels - A4 Plain Paper</title>
        <style>
          @page {
            size: A4 ${orientation};
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
          ${labelHtmlList.join('')}
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
}
