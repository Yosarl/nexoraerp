/**
 * Sales B2C Design Patterns & Reusable Logic
 * 
 * This file contains all styling patterns, design patterns, and reusable logic
 * extracted from SalesB2C.tsx for future reuse across other sales pages.
 * 
 * DO NOT modify this file unless you want to change the shared patterns.
 */

import { useRef } from 'react';

/* ════════════════════════════════════════════════════════════ */
/*  STYLING CONSTANTS                                           */
/* ════════════════════════════════════════════════════════════ */

/** Common button styles used across sales pages (compact by 30%) */
export const commonButtonStyles = {
  minWidth: 70,
  py: 0.35,
  height: 28,
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'none' as const,
  borderRadius: 1.2,
  boxShadow: 'none',
  bgcolor: '#0f766e',
  color: '#fff',
  '& .MuiSvgIcon-root': { fontSize: 16 },
  '&:hover': { bgcolor: '#115e59' },
  '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' },
};

/** Grid container spacing for top header row */
export const topHeaderGridSpacing = 1;

/** Input field border radius */
export const inputBorderRadius = 1.2;

/** Input field font sizes */
export const inputFontSizes = {
  input: '0.72rem',
  label: '0.70rem',
};

/** Table header styles (pink theme, reduced by 20%) */
export const tableHeaderStyles = {
  bgcolor: '#db2777',
  color: 'white',
  fontWeight: 700,
  fontSize: '0.65rem',
  p: '4px 3px',
  textAlign: 'center' as const,
  letterSpacing: 0.2,
  textTransform: 'uppercase' as const,
  borderRight: '1px solid rgba(255,255,255,0.15)',
  borderBottom: '2px solid rgba(0,0,0,0.12)',
};

/** Product info panel colors */
export const productInfoColors = {
  profitBox: { bgcolor: '#f0fdf4', color: '#16a34a' },
  purchaseBox: { bgcolor: '#fefce8', color: '#ca8a04' },
  stockBox: { bgcolor: '#fef2f2', color: '#dc2626' },
  vendorBox: { color: '#64748b' },
  batchBox: { color: '#0284c7' },
  expiryBox: { color: '#ea580c' },
  divider: { bgcolor: '#0f766e', opacity: 0.2 },
};

/** Navigation button styles */
export const navigationButtonStyles = {
  flex: 1,
  py: 0.2,
  height: 24,
  minWidth: 0,
  borderRadius: 1.2,
  bgcolor: '#334155',
  '&:hover': { bgcolor: '#1e293b' },
  boxShadow: 'none',
  '& .MuiSvgIcon-root': { fontSize: 16 },
};

/** Badge/Entry number box styles */
export const entryBadgeStyles = {
  bgcolor: '#0f766e',
  borderRadius: 1.2,
  px: 1,
  py: 0.3,
  textAlign: 'center' as const,
};

/** Section label styles */
export const sectionLabelStyles = {
  fontWeight: 700,
  fontSize: '0.68rem',
  color: '#0f766e',
  mb: 0.6,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.3,
};

/** Field label styles */
export const fieldLabelStyles = {
  fontWeight: 500,
  pt: 0.5,
  fontSize: '0.70rem',
  color: '#475569',
};

/** Dialog paper styles */
export const dialogPaperStyles = {
  borderRadius: 2,
  minWidth: 360,
};

/** Success dialog styles */
export const successDialogStyles = {
  titleColor: '#15803d',
  buttonColor: '#16a34a',
  buttonHover: '#15803d',
};

/** Error dialog styles */
export const errorDialogStyles = {
  titleColor: '#dc2626',
  buttonColor: '#dc2626',
  buttonHover: '#b91c1c',
};

/* ════════════════════════════════════════════════════════════ */
/*  REUSABLE LOGIC - ROW COMMIT/REVERT                          */
/* ════════════════════════════════════════════════════════════ */

/**
 * Row snapshot interface for commit/revert logic
 */
export interface RowSnapshot {
  lineId: string;
  data: any; // LineItem type from the calling component
}

/**
 * Creates refs needed for row commit/revert functionality
 * @returns Object containing rowSnapshotRef and rowCommittedRef
 */
export const createRowCommitRefs = () => {
  const rowSnapshotRef = useRef<RowSnapshot | null>(null);
  const rowCommittedRef = useRef(false);
  return { rowSnapshotRef, rowCommittedRef };
};

/**
 * Handles row focus with snapshot for potential revert
 * Call this when user focuses on a row to edit
 * 
 * @param line - The line item being focused
 * @param rowSnapshotRef - Ref to store the snapshot
 * @param rowCommittedRef - Ref to track if row was committed
 * @param itemNameSnapshotRef - Ref for item name field snapshot
 */
export const handleRowFocusWithSnapshot = (
  line: any, // LineItem type from calling component
  rowSnapshotRef: React.MutableRefObject<RowSnapshot | null>,
  rowCommittedRef: React.MutableRefObject<boolean>,
  itemNameSnapshotRef?: React.MutableRefObject<any>
) => {
  // Save snapshot before editing so we can revert if needed
  rowSnapshotRef.current = { lineId: line.id, data: { ...line } };
  rowCommittedRef.current = false;
  
  // Also snapshot item name field separately
  if (itemNameSnapshotRef) {
    itemNameSnapshotRef.current = { lineId: line.id, data: { ...line } };
  }
};

/**
 * Commits row edits (edits are accepted permanently)
 * Call this when user successfully completes editing a row (e.g., presses Enter)
 * 
 * @param rowSnapshotRef - Ref storing the snapshot
 * @param rowCommittedRef - Ref tracking commit status
 */
export const commitRowEdits = (
  rowSnapshotRef: React.MutableRefObject<RowSnapshot | null>,
  rowCommittedRef: React.MutableRefObject<boolean>
) => {
  rowCommittedRef.current = true;
  rowSnapshotRef.current = null;
};

/**
 * Reverts row edits if row was not committed
 * Call this when user leaves a row without completing it (e.g., clears item name and blurs)
 * 
 * @param line - The line item to potentially revert
 * @param setLines - setState function from the calling component
 * @param rowSnapshotRef - Ref storing the snapshot
 * @param rowCommittedRef - Ref tracking commit status
 * @param itemNameSnapshotRef - Optional ref for item name field snapshot
 */
export const revertRowEditsIfNotCommitted = (
  line: any, // LineItem type from calling component
  setLines: React.Dispatch<React.SetStateAction<any[]>>,
  rowSnapshotRef: React.MutableRefObject<RowSnapshot | null>,
  rowCommittedRef: React.MutableRefObject<boolean>,
  itemNameSnapshotRef?: React.MutableRefObject<any>
) => {
  if (!rowCommittedRef.current && rowSnapshotRef.current && rowSnapshotRef.current.lineId === line.id) {
    const snapshotData = rowSnapshotRef.current.data;
    setLines((prev: any[]) =>
      prev.map((l: any) => (l.id === line.id ? snapshotData : l))
    );
    rowCommittedRef.current = false;
    rowSnapshotRef.current = null;
  }
  
  // Also handle item name field revert
  if (itemNameSnapshotRef?.current && itemNameSnapshotRef.current.lineId === line.id && !line.productId) {
    setLines((prev: any[]) =>
      prev.map((l: any) => (l.id === line.id ? itemNameSnapshotRef.current.data : l))
    );
  }
};

/**
 * Handles item name field blur with revert logic
 * Specifically for reverting item name changes if user clears the field
 * 
 * @param line - The line item
 * @param setLines - setState function from the calling component
 * @param itemNameSnapshotRef - Ref storing item name snapshot
 * @param isCommitted - Whether the row is committed (if true, don't revert on blur)
 */
export const handleItemNameBlurWithRevert = (
  line: any, // LineItem type from calling component
  setLines: React.Dispatch<React.SetStateAction<any[]>>,
  itemNameSnapshotRef: React.MutableRefObject<any>,
  isCommitted?: boolean
) => {
  // Only revert if row is NOT committed AND product was cleared
  if (!isCommitted && 
      itemNameSnapshotRef.current && 
      itemNameSnapshotRef.current.lineId === line.id && 
      !line.productId) {
    // Capture snapshot data before setLines callback to avoid null reference
    const snapshotData = itemNameSnapshotRef.current.data;
    // User cleared item name without selecting a product - revert
    setLines((prev: any[]) =>
      prev.map((l: any) => (l.id === line.id ? snapshotData : l))
    );
  }
};

/* ════════════════════════════════════════════════════════════ */
/*  REUSABLE LOGIC - ENTER KEY NAVIGATION FLOW                  */
/* ════════════════════════════════════════════════════════════ */

/**
 * Configuration for Enter key navigation flow
 */
export interface EnterKeyFlowConfig {
  /** Current line index in the lines array */
  currentIndex: number;
  /** Total number of lines */
  totalLines: number;
  /** Whether current line is the last row */
  isLastRow: boolean;
  /** Whether current row is blank/incomplete */
  isBlank: boolean;
  /** Whether row has required fields filled */
  isValid: boolean;
  /** Lines array */
  lines?: any[];
}

/**
 * Handles Enter key press on IMEI field
 * Moves to Item Name field or creates new row
 * 
 * @param config - Enter key flow configuration
 * @param imeiInputRefs - Refs object for IMEI inputs
 * @param _itemNameInputRefs - Refs object for Item Name inputs
 * @param emptyLine - Function to create empty line
 * @param setLines - setState function from calling component
 * @param setActiveLineId - Optional function to set active line ID
 */
export const handleImeiEnterKey = (
  config: EnterKeyFlowConfig,
  imeiInputRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>,
  _itemNameInputRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>,
  emptyLine: () => any,
  setLines: React.Dispatch<React.SetStateAction<any[]>>,
  setActiveLineId?: React.Dispatch<React.SetStateAction<string | null>>
) => {
  const { currentIndex, isLastRow, isBlank, lines = [] } = config;
  
  if (isLastRow && isBlank) {
    // Last row and blank - go to Save button
    setTimeout(() => {
      // saveButtonRef.current?.focus() - caller should provide this
    }, 50);
    return;
  }
  
  if (currentIndex === lines.length - 1) {
    // Add a new row and focus its IMEI field
    const newLine = emptyLine();
    setLines((prev) => [...prev, newLine]);
    setTimeout(() => {
      imeiInputRefs.current[newLine.id]?.focus();
    }, 100);
    if (setActiveLineId) {
      setActiveLineId(newLine.id);
    }
  } else {
    // Move to next row's IMEI field
    const nextLine = lines[currentIndex + 1];
    setTimeout(() => {
      imeiInputRefs.current[nextLine?.id]?.focus();
    }, 50);
  }
};

/**
 * Handles Enter key press on Item Name field
 * Validates row and moves to next field or row
 * 
 * @param config - Enter key flow configuration
 * @param line - Current line item
 * @param _itemNameInputRefs - Refs object for Item Name inputs
 * @param qtyInputRefs - Refs object for Quantity inputs
 * @param saveButtonRef - Ref to Save button
 * @param products - Products list for validation
 * @param handleProductSelect - Function to handle product selection
 */
export const handleItemNameEnterKey = (
  config: EnterKeyFlowConfig,
  line: any, // LineItem type from calling component
  _itemNameInputRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>,
  qtyInputRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>,
  saveButtonRef: React.MutableRefObject<HTMLButtonElement | null>,
  products: any[], // Product[] type from calling component
  handleProductSelect?: (lineId: string, product: any) => void
) => {
  const { isLastRow, isBlank } = config;
  
  if (isLastRow && isBlank) {
    // Last row and blank - go to Save button
    setTimeout(() => {
      saveButtonRef.current?.focus();
    }, 50);
    return;
  }
  
  if (!line.productId && line.name.trim()) {
    // User typed a name - try to match exact product
    const typed = line.name.trim().toLowerCase();
    const match = products.find((p) => p.name.toLowerCase() === typed);
    if (match) {
      if (handleProductSelect) {
        handleProductSelect(line.id, match);
      }
      setTimeout(() => {
        qtyInputRefs.current[line.id]?.focus();
        qtyInputRefs.current[line.id]?.select();
      }, 100);
      return;
    }
  }
  
  // If row has productId, move to Qty field
  if (line.productId) {
    setTimeout(() => {
      qtyInputRefs.current[line.id]?.focus();
      qtyInputRefs.current[line.id]?.select();
    }, 50);
  }
};

/**
 * Handles Enter key press on Quantity field
 * Validates and moves to Price field or next row
 * 
 * @param config - Enter key flow configuration
 * @param line - Current line item
 * @param priceInputRefs - Refs object for Price inputs
 * @param saveButtonRef - Ref to Save button
 */
export const handleQtyEnterKey = (
  config: EnterKeyFlowConfig,
  line: any, // LineItem type from calling component
  priceInputRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>,
  saveButtonRef: React.MutableRefObject<HTMLButtonElement | null>
) => {
  const { isLastRow, isBlank } = config;
  
  if (isLastRow && isBlank) {
    // Last row and blank - go to Save button
    setTimeout(() => {
      saveButtonRef.current?.focus();
    }, 50);
    return;
  }
  
  if (line.quantity > 0) {
    // Valid quantity - move to Price field
    const priceInput = priceInputRefs.current[line.id];
    if (priceInput) {
      priceInput.focus();
      priceInput.select();
    }
  }
};

/**
 * Handles Enter key press on Price field
 * Validates row, commits edits, and moves to next row
 * 
 * @param config - Enter key flow configuration
 * @param line - Current line item
 * @param enterRow - Function to enter/focus a row
 * @param setActiveLineId - Function to set active line ID
 * @param imeiInputRefs - Refs object for IMEI inputs
 * @param saveButtonRef - Ref to Save button
 * @param commitRowEdits - Function to commit row edits
 * @param rowCommittedRef - Ref tracking commit status
 */
export const handlePriceEnterKey = (
  config: EnterKeyFlowConfig,
  line: any, // LineItem type from calling component
  enterRow: (line: any) => void,
  setActiveLineId: React.Dispatch<React.SetStateAction<string | null>>,
  imeiInputRefs: React.MutableRefObject<{ [key: string]: HTMLInputElement | null }>,
  saveButtonRef: React.MutableRefObject<HTMLButtonElement | null>,
  commitRowEdits: (
    rowSnapshotRef: React.MutableRefObject<RowSnapshot | null>,
    rowCommittedRef: React.MutableRefObject<boolean>
  ) => void,
  rowCommittedRef: React.MutableRefObject<boolean>
) => {
  const { currentIndex, isLastRow, isBlank, lines = [] } = config;
  
  // Validate row completeness
  if (!line.productCode || !line.name || line.quantity <= 0 || line.price <= 0) {
    if (isLastRow && isBlank) {
      // Last row and blank - go to Save button
      setTimeout(() => {
        saveButtonRef.current?.focus();
      }, 50);
      return;
    }
    
    // Incomplete row - focus appropriate field
    if (!line.productCode || !line.name) {
      setTimeout(() => {
        // itemNameInputRefs.current[line.id]?.focus() - caller should provide
      }, 50);
    } else if (line.quantity <= 0) {
      setTimeout(() => {
        // qtyInputRefs.current[line.id]?.focus() - caller should provide
      }, 50);
    } else if (line.price <= 0) {
      setTimeout(() => {
        // priceInputRefs.current[line.id]?.focus() - caller should provide
      }, 50);
    }
    return;
  }
  
  // Row is valid - commit edits
  commitRowEdits(
    {} as React.MutableRefObject<RowSnapshot | null>, // Pass actual ref from caller
    rowCommittedRef
  );
  
  // Check if there's a next row
  if (currentIndex >= 0 && currentIndex < lines.length - 1) {
    // Move to next row
    const nextLine = lines[currentIndex + 1];
    enterRow(nextLine);
    setActiveLineId(nextLine.id);
    setTimeout(() => {
      imeiInputRefs.current[nextLine.id]?.focus();
    }, 50);
    return;
  }
  
  // Last valid row - create new row
  // Caller should implement new row creation
};

/* ════════════════════════════════════════════════════════════ */
/*  REUSABLE LOGIC - PRODUCT INFO                               */
/* ════════════════════════════════════════════════════════════ */

/**
 * Product info structure for display panel
 */
export interface ProductInfoDisplay {
  profit?: number;
  purchaseRate: number;
  lastVendor?: string;
  totalStock?: number;
  previousPrice?: number;
  stock?: number;
  retailPrice?: number;
  wholesalePrice?: number;
  batchNumber?: string;
  expiryDate?: string;
}

/**
 * Calculates profit for a line item considering multi-unit conversion
 * 
 * @param line - Line item with price, purchasePrice, availableUnits, unitId
 * @returns Calculated profit value
 */
export const calculateProfit = (line: any): number => { // LineItem type from calling component
  const unit = line.availableUnits?.find((u: any) => u.id === line.unitId);
  const isMulti = unit?.isMultiUnit && unit?.conversion;
  const multiCost = isMulti ? line.purchasePrice * (unit?.conversion || 1) : line.purchasePrice;
  return line.price - multiCost;
};

/**
 * Formats stock display with unit conversion
 * 
 * @param basePieces - Stock in base unit pieces
 * @param pcsInside - Pieces inside the selected unit (conversion factor)
 * @param unitName - Name of the unit
 * @returns Formatted stock display string
 */
export const formatStockDisplay = (
  basePieces: number | undefined,
  pcsInside?: number,
  unitName?: string
): string => {
  const isNum = typeof basePieces === 'number';
  if (isNum && pcsInside && pcsInside > 0) {
    const inUnit = basePieces / pcsInside;
    return `${basePieces} pcs${unitName ? ` (${inUnit.toFixed(2)} ${unitName})` : ''}`;
  }
  return isNum ? `${basePieces} pcs` : (basePieces ?? '-');
};

/* ════════════════════════════════════════════════════════════ */
/*  REUSABLE LOGIC - STOCK VALIDATION                           */
/* ════════════════════════════════════════════════════════════ */

/**
 * Validates stock availability before saving/editing
 * 
 * @param validLines - Array of valid line items to validate
 * @param getStockForProduct - Async function to get stock for a product
 * @param companyId - Company ID for API call
 * @param originalInvoiceItemsRef - Ref containing original invoice items (for editing)
 * @returns Promise<boolean> - true if all stock checks pass
 */
export const validateStockAvailability = async (
  validLines: any[], // LineItem[] type from calling component
  getStockForProduct: (productId: string, companyId: string) => Promise<number>,
  companyId: string,
  originalInvoiceItemsRef?: React.MutableRefObject<any[]>
): Promise<boolean> => {
  const productQtyMap = new Map<string, { name: string; totalPieces: number }>();
  
  // Calculate total quantity per product
  for (const line of validLines) {
    const unit = line.availableUnits.find((u: any) => u.id === line.unitId);
    const conv = (unit?.isMultiUnit && unit?.conversion) ? unit.conversion : 1;
    const pieces = line.quantity * conv;
    
    const existing = productQtyMap.get(line.productId);
    if (existing) {
      existing.totalPieces += pieces;
    } else {
      productQtyMap.set(line.productId, {
        name: line.name,
        totalPieces: pieces,
      });
    }
  }
  
  // Check stock for each product
  for (const [productId, info] of productQtyMap) {
    let available = await getStockForProduct(productId, companyId);
    
    // Add back original invoice qty if editing
    if (originalInvoiceItemsRef?.current) {
      const originalPieces = originalInvoiceItemsRef.current
        .filter((o: any) => o.productId === productId)
        .reduce((sum: number, o: any) => sum + (o.quantity * o.unitConversion), 0);
      available += originalPieces;
    }
    
    if (available < info.totalPieces) {
      // Stock insufficient - caller should show error dialog
      return false;
    }
  }
  
  return true;
};

/* ════════════════════════════════════════════════════════════ */
/*  EXPORT ALL PATTERNS                                         */
/* ════════════════════════════════════════════════════════════ */

export default {
  // Styling constants
  commonButtonStyles,
  topHeaderGridSpacing,
  inputBorderRadius,
  inputFontSizes,
  tableHeaderStyles,
  productInfoColors,
  navigationButtonStyles,
  entryBadgeStyles,
  sectionLabelStyles,
  fieldLabelStyles,
  dialogPaperStyles,
  successDialogStyles,
  errorDialogStyles,
  
  // Row commit/revert logic
  createRowCommitRefs,
  handleRowFocusWithSnapshot,
  commitRowEdits,
  revertRowEditsIfNotCommitted,
  handleItemNameBlurWithRevert,
  
  // Enter key navigation flow
  handleImeiEnterKey,
  handleItemNameEnterKey,
  handleQtyEnterKey,
  handlePriceEnterKey,
  
  // Product info logic
  calculateProfit,
  formatStockDisplay,
  
  // Stock validation
  validateStockAvailability,
};
