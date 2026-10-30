import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  FormControl,
  Select,
  MenuItem,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
  Tooltip,
  Autocomplete,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LocalPrintshopIcon from '@mui/icons-material/LocalPrintshop';
import SaveIcon from '@mui/icons-material/Save';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';
import PrintIcon from '@mui/icons-material/Print';
import CropRotateIcon from '@mui/icons-material/CropRotate';
import AspectRatioIcon from '@mui/icons-material/AspectRatio';

import {
  BarcodeDesignConfig,
  PaperFeedMode,
  loadAllBarcodeTemplates,
  getDefaultPurchaseBarcodeTemplate,
  setDefaultPurchaseBarcodeTemplate,
  getDefaultPaperFeedMode,
  setDefaultPaperFeedMode,
  generateSingleLabelHtmlString,
  executePrintBarcodeDocument,
  normalizeConfig,
} from '../utils/barcodePrintHelper';

export interface PurchaseBarcodeItem {
  id: string;
  productId?: string;
  productCode?: string;
  imei?: string;
  name: string;
  quantity: number;
  retail?: number;
  wholesale?: number;
  mrp?: number;
  specialPrice1?: number;
  specialPrice2?: number;
  unitName?: string;
  batchNumber?: string;
  expiryDate?: string;
}

interface PurchaseBarcodePrintDialogProps {
  open: boolean;
  onClose: () => void;
  documentTitle: string; // "Purchase Entry" or "Opening Purchase Entry"
  invoiceNo?: string;
  lines: PurchaseBarcodeItem[];
  products?: any[];
  companyName?: string;
}

export default function PurchaseBarcodePrintDialog({
  open,
  onClose,
  documentTitle,
  invoiceNo,
  lines,
  products = [],
  companyName,
}: PurchaseBarcodePrintDialogProps) {
  // 1. Templates loading & selection
  const [templates, setTemplates] = useState<Record<string, BarcodeDesignConfig>>({});
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>('50x25_supermarket');
  const [defaultSavedFeedback, setDefaultSavedFeedback] = useState<boolean>(false);

  // 2. Paper Feed Mode state & saving
  const [paperFeedMode, setPaperFeedMode] = useState<PaperFeedMode>('thermal');
  const [feedModeSavedFeedback, setFeedModeSavedFeedback] = useState<boolean>(false);
  const [a4Columns, setA4Columns] = useState<number | string>(3);
  const [a4Rows, setA4Rows] = useState<number | string>(8);
  const [a4SkipLabels, setA4SkipLabels] = useState<number | string>(0);

  // 3. Quantity combo box state: 'Full' or numeric string '1', '2', ... or any custom number
  const [qtyOption, setQtyOption] = useState<string>('Full');

  // 4. Selection and individual item quantities (allow string during typing to avoid 0 lock)
  const [selectedItemIds, setSelectedItemIds] = useState<Record<string, boolean>>({});
  const [itemQuantities, setItemQuantities] = useState<Record<string, number | string>>({});

  // 5. Installed printers via Electron if available
  const [installedPrinters, setInstalledPrinters] = useState<string[]>([]);

  // Load installed printers
  useEffect(() => {
    if (window.electronAPI?.getPrinters) {
      window.electronAPI
        .getPrinters()
        .then((printers) => {
          if (Array.isArray(printers) && printers.length > 0) {
            setInstalledPrinters(printers.map((p) => p.name || p.displayName || 'Unknown Printer'));
          }
        })
        .catch(() => {});
    }
  }, []);

  // Filter valid lines that have a product name/id and quantity > 0
  const validLines = useMemo(() => {
    return lines.filter(
      (l) => (l.productId || l.name?.trim()) && Number(l.quantity) > 0
    );
  }, [lines]);

  // When dialog opens, load templates, default paper feed mode, and initialize selection
  useEffect(() => {
    if (open) {
      const allTemplates = loadAllBarcodeTemplates();
      setTemplates(allTemplates);
      const defaultKey = getDefaultPurchaseBarcodeTemplate(allTemplates);
      setSelectedTemplateKey(defaultKey);
      setDefaultSavedFeedback(false);

      const defaultFeed = getDefaultPaperFeedMode();
      setPaperFeedMode(defaultFeed);
      setFeedModeSavedFeedback(false);

      // Initialize selected items and quantities
      const initialSelected: Record<string, boolean> = {};
      const initialQuantities: Record<string, number | string> = {};

      validLines.forEach((l) => {
        initialSelected[l.id] = true;
        // Default to full purchased quantity initially
        initialQuantities[l.id] = Math.max(1, Math.round(Number(l.quantity) || 1));
      });

      setSelectedItemIds(initialSelected);
      setItemQuantities(initialQuantities);
      setQtyOption('Full');
    }
  }, [open, validLines]);

  // Apply quantity option to all valid lines
  const applyQuantityOption = (val: string) => {
    const trimmed = (val || '').trim();
    const isFull = trimmed.toLowerCase() === 'full' || trimmed.toLowerCase() === 'all';
    const numVal = parseInt(trimmed, 10);

    setItemQuantities((prev) => {
      const updated = { ...prev };
      validLines.forEach((l) => {
        if (isFull) {
          updated[l.id] = Math.max(1, Math.round(Number(l.quantity) || 1));
        } else if (!isNaN(numVal) && numVal > 0) {
          updated[l.id] = numVal;
        }
      });
      return updated;
    });
  };

  // Active template config
  const currentConfig: BarcodeDesignConfig = useMemo(() => {
    const candidate = templates[selectedTemplateKey];
    return normalizeConfig(candidate, selectedTemplateKey);
  }, [templates, selectedTemplateKey]);

  // Save current template as default
  const handleSaveDefaultTemplate = () => {
    setDefaultPurchaseBarcodeTemplate(selectedTemplateKey);
    setDefaultSavedFeedback(true);
    setTimeout(() => setDefaultSavedFeedback(false), 2500);
  };

  // Save current paper feed mode as default
  const handleSaveDefaultFeedMode = () => {
    setDefaultPaperFeedMode(paperFeedMode);
    setFeedModeSavedFeedback(true);
    setTimeout(() => setFeedModeSavedFeedback(false), 2500);
  };

  // Toggle selection for a single item
  const handleToggleSelect = (id: string) => {
    setSelectedItemIds((prev) => {
      const nextVal = !prev[id];
      if (nextVal && (itemQuantities[id] === '' || Number(itemQuantities[id]) <= 0)) {
        const line = validLines.find((l) => l.id === id);
        const fallbackQty = line ? Math.max(1, Math.round(Number(line.quantity) || 1)) : 1;
        setItemQuantities((qPrev) => ({ ...qPrev, [id]: fallbackQty }));
      }
      return {
        ...prev,
        [id]: nextVal,
      };
    });
  };

  // Toggle all items
  const allSelected = validLines.length > 0 && validLines.every((l) => selectedItemIds[l.id]);
  const handleToggleSelectAll = () => {
    const nextVal = !allSelected;
    const updated: Record<string, boolean> = {};
    validLines.forEach((l) => {
      updated[l.id] = nextVal;
      if (nextVal && (itemQuantities[l.id] === '' || Number(itemQuantities[l.id]) <= 0)) {
        setItemQuantities((qPrev) => ({
          ...qPrev,
          [l.id]: Math.max(1, Math.round(Number(l.quantity) || 1)),
        }));
      }
    });
    setSelectedItemIds(updated);
  };

  // Update quantity for a specific item in the grid - allows typing smoothly
  const handleItemQuantityChange = (id: string, qtyStr: string) => {
    // Automatically select item when user alters its quantity
    setSelectedItemIds((prev) => ({
      ...prev,
      [id]: true,
    }));

    if (qtyStr === '') {
      setItemQuantities((prev) => ({
        ...prev,
        [id]: '',
      }));
      return;
    }

    const parsed = parseInt(qtyStr, 10);
    if (!isNaN(parsed)) {
      setItemQuantities((prev) => ({
        ...prev,
        [id]: Math.max(0, parsed),
      }));
    }
  };

  // Calculate totals
  const totalSelectedItems = validLines.filter((l) => selectedItemIds[l.id]).length;
  const totalLabelsToPrint = validLines.reduce((acc, l) => {
    if (!selectedItemIds[l.id]) return acc;
    return acc + (Number(itemQuantities[l.id]) || 0);
  }, 0);

  // Look up product metadata (category, brand, etc.)
  const findProductMeta = (line: PurchaseBarcodeItem) => {
    if (!line.productId && !line.productCode && !line.imei) return null;
    return products.find(
      (p) =>
        (line.productId && p._id === line.productId) ||
        (line.productCode && p.code === line.productCode) ||
        (line.imei && p.imei === line.imei)
    );
  };

  // Print execution
  const handleExecutePrint = () => {
    if (totalLabelsToPrint <= 0) return;

    const labelHtmlList: string[] = [];

    validLines.forEach((line) => {
      if (!selectedItemIds[line.id]) return;
      const copies = Number(itemQuantities[line.id]) || 0;
      if (copies <= 0) return;

      const pMeta = findProductMeta(line);

      // Barcode / IMEI resolution
      const barcodeValue = (
        line.imei ||
        pMeta?.imei ||
        line.productCode ||
        pMeta?.code ||
        ''
      ).trim();

      // Sample data mapping for label generation
      const sampleData: Record<string, string> = {
        name: line.name || pMeta?.name || 'Product',
        imei: barcodeValue,
        code: line.productCode || pMeta?.code || barcodeValue,
        retailPrice:
          line.retail != null
            ? Number(line.retail).toFixed(2)
            : pMeta?.retailPrice != null
            ? Number(pMeta.retailPrice).toFixed(2)
            : '0.00',
        wholesalePrice:
          line.wholesale != null
            ? Number(line.wholesale).toFixed(2)
            : pMeta?.wholesalePrice != null
            ? Number(pMeta.wholesalePrice).toFixed(2)
            : '0.00',
        specialPrice: line.specialPrice1 != null ? Number(line.specialPrice1).toFixed(2) : '',
        specialPrice2: line.specialPrice2 != null ? Number(line.specialPrice2).toFixed(2) : '',
        unit: line.unitName || (typeof pMeta?.unitOfMeasureId === 'object' ? pMeta?.unitOfMeasureId?.name || '' : ''),
        category: pMeta?.category || '',
        itemGroup: pMeta?.itemGroup || '',
        brand: pMeta?.brand || '',
        manufacturer: pMeta?.manufacturer || '',
        batchNumber: line.batchNumber || pMeta?.batchNumber || '',
        expiryDate: line.expiryDate || pMeta?.expiryDate || '',
        customText: companyName ? `Inclusive of 5% VAT • ${companyName}` : 'Inclusive of 5% VAT',
      };

      // Generate single HTML label for this item
      const singleLabelHtml = generateSingleLabelHtmlString(currentConfig, sampleData);

      // Repeat for number of copies requested
      for (let i = 0; i < copies; i++) {
        labelHtmlList.push(singleLabelHtml);
      }
    });

    if (labelHtmlList.length === 0) return;

    // Execute print with selected paper feed mode and template's saved orientation
    executePrintBarcodeDocument(
      currentConfig,
      labelHtmlList,
      currentConfig.orientation,
      paperFeedMode,
      {
        a4Columns: Number(a4Columns) || 3,
        a4Rows: Number(a4Rows) || 8,
        a4SkipLabels: Number(a4SkipLabels) || 0,
      }
    );
    onClose();
  };

  const comboOptions = ['Full', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '20', '50'];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
      {/* Dialog Header */}
      <DialogTitle
        sx={{
          m: 0,
          p: 2,
          pb: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #e2e8f0',
          bgcolor: '#f8fafc',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
          <Box
            sx={{
              bgcolor: '#7c3aed',
              color: '#ffffff',
              p: 0.8,
              borderRadius: 1.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LocalPrintshopIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.05rem', color: '#1e293b', lineHeight: 1.2 }}>
              Print Barcode Labels
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              {documentTitle} {invoiceNo ? `• Ref #${invoiceNo}` : ''} • {validLines.length} Item(s)
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: '#94a3b8' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 2.5, bgcolor: '#ffffff' }}>
        {/* Preset / Template & Quantity Row */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2.5,
            bgcolor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
            {/* 1. Template Selector with Save Default Button */}
            <Box sx={{ flex: '1 1 270px', minWidth: 260 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.8 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#334155' }}>
                  Barcode Template / Preset
                </Typography>
                <Tooltip title="Save selected template as default for future purchases/opening purchase">
                  <Button
                    size="small"
                    variant={defaultSavedFeedback ? 'contained' : 'outlined'}
                    color={defaultSavedFeedback ? 'success' : 'primary'}
                    startIcon={defaultSavedFeedback ? <BookmarkAddedIcon sx={{ fontSize: 15 }} /> : <SaveIcon sx={{ fontSize: 15 }} />}
                    onClick={handleSaveDefaultTemplate}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      py: 0.2,
                      px: 1,
                      height: 24,
                      borderRadius: 1,
                    }}
                  >
                    {defaultSavedFeedback ? 'Default Saved ✓' : 'Save as Default'}
                  </Button>
                </Tooltip>
              </Box>

              <FormControl fullWidth size="small">
                <Select
                  value={selectedTemplateKey}
                  onChange={(e) => setSelectedTemplateKey(e.target.value)}
                  sx={{
                    bgcolor: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: 1.5,
                  }}
                >
                  {Object.entries(templates).map(([key, t]) => (
                    <MenuItem key={key} value={key} sx={{ fontSize: '0.82rem', py: 0.8 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1e293b' }}>
                          {t.templateName || key}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', ml: 1.5, fontFamily: 'monospace' }}>
                          {t.labelWidthMm}×{t.labelHeightMm}mm ({t.orientation})
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Template Saved Properties Badge Bar */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8, mt: 1 }}>
                <Chip
                  size="small"
                  icon={<AspectRatioIcon sx={{ fontSize: '13px !important' }} />}
                  label={`Size: ${currentConfig.labelWidthMm} × ${currentConfig.labelHeightMm} mm`}
                  sx={{ fontSize: '0.72rem', bgcolor: '#e0e7ff', color: '#4338ca', fontWeight: 600 }}
                />
                <Chip
                  size="small"
                  icon={<CropRotateIcon sx={{ fontSize: '13px !important' }} />}
                  label={`Orientation: ${currentConfig.orientation === 'portrait' ? 'Portrait' : 'Landscape'}`}
                  sx={{ fontSize: '0.72rem', bgcolor: '#f1f5f9', color: '#334155', fontWeight: 600 }}
                />
                <Chip
                  size="small"
                  icon={<PrintIcon sx={{ fontSize: '13px !important' }} />}
                  label={`Printer: ${currentConfig.targetPrinter || 'Default Thermal'}${
                    installedPrinters.length > 0 && installedPrinters.includes(currentConfig.targetPrinter)
                      ? ' (Detected)'
                      : ''
                  }`}
                  sx={{ fontSize: '0.72rem', bgcolor: '#f1f5f9', color: '#334155', fontWeight: 600 }}
                />
              </Box>
            </Box>

            {/* 2. Paper Feed Mode Selector with Save Default Button */}
            <Box sx={{ flex: '1 1 240px', minWidth: 230 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.8 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#334155' }}>
                  Paper Feed Mode
                </Typography>
                <Tooltip title="Save selected paper feed mode as default for future barcode printing">
                  <Button
                    size="small"
                    variant={feedModeSavedFeedback ? 'contained' : 'outlined'}
                    color={feedModeSavedFeedback ? 'success' : 'primary'}
                    startIcon={feedModeSavedFeedback ? <BookmarkAddedIcon sx={{ fontSize: 15 }} /> : <SaveIcon sx={{ fontSize: 15 }} />}
                    onClick={handleSaveDefaultFeedMode}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      py: 0.2,
                      px: 1,
                      height: 24,
                      borderRadius: 1,
                    }}
                  >
                    {feedModeSavedFeedback ? 'Default Saved ✓' : 'Save as Default'}
                  </Button>
                </Tooltip>
              </Box>

              <FormControl fullWidth size="small">
                <Select
                  value={paperFeedMode}
                  onChange={(e) => setPaperFeedMode(e.target.value as PaperFeedMode)}
                  sx={{
                    bgcolor: '#ffffff',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    borderRadius: 1.5,
                  }}
                >
                  <MenuItem value="thermal" sx={{ fontSize: '0.82rem' }}>
                    🏷️ Continuous Thermal Roll
                  </MenuItem>
                  <MenuItem value="a4_sheet" sx={{ fontSize: '0.82rem' }}>
                    📄 A4 Sticker Sheet (Grid)
                  </MenuItem>
                  <MenuItem value="a4_top_left" sx={{ fontSize: '0.82rem' }}>
                    📄 A4 Plain Paper / PDF
                  </MenuItem>
                </Select>
              </FormControl>

              <Typography variant="caption" sx={{ display: 'block', mt: 0.8, color: '#64748b' }}>
                {paperFeedMode === 'thermal'
                  ? '• Continuous thermal rolls (1 label per page)'
                  : paperFeedMode === 'a4_sheet'
                  ? '• Multi-label grid on A4 sticker sheets'
                  : '• Plain A4 paper arranged from top-left'}
              </Typography>
            </Box>

            {/* 3. Quantity Combo Box (Allows Free Typing & Instant Presets) */}
            <Box sx={{ flex: '1 1 200px', minWidth: 190 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#334155', mb: 0.8 }}>
                Print Quantity
              </Typography>
              <Autocomplete
                freeSolo
                size="small"
                value={qtyOption}
                inputValue={qtyOption}
                options={comboOptions}
                onInputChange={(_, newInputValue, reason) => {
                  setQtyOption(newInputValue);
                  if (reason === 'input' || reason === 'reset') {
                    applyQuantityOption(newInputValue);
                  }
                }}
                onChange={(_, newValue) => {
                  const val = newValue || 'Full';
                  setQtyOption(val);
                  applyQuantityOption(val);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    placeholder="Full, 1, 2, ... or any number"
                    onFocus={(e) => e.target.select()}
                    onBlur={() => {
                      if (!qtyOption.trim()) {
                        setQtyOption('Full');
                        applyQuantityOption('Full');
                      }
                    }}
                    sx={{
                      bgcolor: '#ffffff',
                      borderRadius: 1.5,
                      '& input': { fontSize: '0.85rem', fontWeight: 600 },
                    }}
                  />
                )}
              />

              {/* Quick Preset Buttons */}
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.8, flexWrap: 'wrap' }}>
                {['Full', '1', '2', '5', '10'].map((preset) => (
                  <Chip
                    key={preset}
                    label={preset}
                    size="small"
                    variant={qtyOption.toLowerCase() === preset.toLowerCase() ? 'filled' : 'outlined'}
                    color={qtyOption.toLowerCase() === preset.toLowerCase() ? 'primary' : 'default'}
                    onClick={() => {
                      setQtyOption(preset);
                      applyQuantityOption(preset);
                    }}
                    sx={{ height: 21, fontSize: '0.72rem', cursor: 'pointer', fontWeight: 600 }}
                  />
                ))}
              </Box>
            </Box>
          </Box>

          {/* Optional A4 Sticker Sheet Grid Options */}
          {paperFeedMode === 'a4_sheet' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5, mt: 2, pt: 1.5, borderTop: '1px dashed #cbd5e1' }}>
              <TextField
                size="small"
                type="number"
                label="Columns Across"
                value={a4Columns}
                onChange={(e) => setA4Columns(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                onBlur={() => {
                  if (a4Columns === '' || Number(a4Columns) < 1) setA4Columns(3);
                }}
                inputProps={{ min: 1, max: 10, style: { fontSize: '0.8rem', padding: '4px 8px' } }}
                InputLabelProps={{ sx: { bgcolor: '#f8fafc', px: 0.5, fontSize: '0.75rem' } }}
              />
              <TextField
                size="small"
                type="number"
                label="Rows Down"
                value={a4Rows}
                onChange={(e) => setA4Rows(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value, 10) || 1))}
                onBlur={() => {
                  if (a4Rows === '' || Number(a4Rows) < 1) setA4Rows(8);
                }}
                inputProps={{ min: 1, max: 30, style: { fontSize: '0.8rem', padding: '4px 8px' } }}
                InputLabelProps={{ sx: { bgcolor: '#f8fafc', px: 0.5, fontSize: '0.75rem' } }}
              />
              <TextField
                size="small"
                type="number"
                label="Skip Used Stickers"
                value={a4SkipLabels}
                onChange={(e) => setA4SkipLabels(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0))}
                onBlur={() => {
                  if (a4SkipLabels === '' || Number(a4SkipLabels) < 0) setA4SkipLabels(0);
                }}
                inputProps={{ min: 0, max: 100, style: { fontSize: '0.8rem', padding: '4px 8px' } }}
                helperText="Start position on sheet"
                InputLabelProps={{ sx: { bgcolor: '#f8fafc', px: 0.5, fontSize: '0.75rem' } }}
              />
            </Box>
          )}
        </Paper>

        {/* Item Selection Table */}
        <Box sx={{ mb: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e293b' }}>
            Purchased Items for Barcode Printing ({validLines.length})
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              onClick={handleToggleSelectAll}
              sx={{ textTransform: 'none', fontSize: '0.75rem', fontWeight: 600, py: 0.2 }}
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </Button>
          </Box>
        </Box>

        <TableContainer
          component={Paper}
          elevation={0}
          sx={{
            maxHeight: 280,
            border: '1px solid #cbd5e1',
            borderRadius: 1.5,
            bgcolor: '#ffffff',
          }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: '#f8fafc', fontWeight: 700, fontSize: '0.75rem', color: '#475569', py: 0.8 } }}>
                <TableCell padding="checkbox" sx={{ width: 40 }}>
                  <Checkbox
                    size="small"
                    checked={allSelected}
                    indeterminate={validLines.some((l) => selectedItemIds[l.id]) && !allSelected}
                    onChange={handleToggleSelectAll}
                  />
                </TableCell>
                <TableCell>Item Name</TableCell>
                <TableCell>Barcode / Code</TableCell>
                <TableCell align="right">Selling Price</TableCell>
                <TableCell align="center">Purchased Qty</TableCell>
                <TableCell align="center" sx={{ width: 110 }}>Print Qty</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {validLines.map((line, idx) => {
                const isSelected = !!selectedItemIds[line.id];
                const pMeta = findProductMeta(line);
                const barcode = line.imei || pMeta?.imei || line.productCode || pMeta?.code || '—';
                const printQty = itemQuantities[line.id] !== undefined ? itemQuantities[line.id] : 1;

                return (
                  <TableRow
                    key={line.id || idx}
                    hover
                    sx={{
                      bgcolor: isSelected ? 'inherit' : '#f9fafb',
                      opacity: isSelected ? 1 : 0.6,
                      '& td': { py: 0.5, fontSize: '0.78rem' },
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(line.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.78rem', color: '#1e293b' }}>
                        {line.name || 'Unnamed Product'}
                      </Typography>
                      {line.batchNumber && (
                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                          Batch: {line.batchNumber}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#334155' }}>
                        {barcode}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#0f766e', fontSize: '0.78rem' }}>
                        {line.retail != null ? Number(line.retail).toFixed(2) : '0.00'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        size="small"
                        label={line.quantity}
                        sx={{ fontSize: '0.72rem', height: 20, bgcolor: '#f1f5f9', fontWeight: 600 }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <TextField
                        size="small"
                        type="number"
                        value={printQty}
                        onChange={(e) => handleItemQuantityChange(line.id, e.target.value)}
                        onFocus={(e) => e.target.select()}
                        onBlur={() => {
                          const current = itemQuantities[line.id];
                          if (current === '' || current === undefined) {
                            setItemQuantities((prev) => ({ ...prev, [line.id]: 0 }));
                          }
                        }}
                        inputProps={{
                          min: 0,
                          style: { textAlign: 'center', padding: '3px 6px', fontSize: '0.78rem', fontWeight: 700 }
                        }}
                        sx={{
                          width: 80,
                          bgcolor: isSelected ? '#ffffff' : '#f1f5f9',
                          borderRadius: 1,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        {validLines.length === 0 && (
          <Alert severity="warning" sx={{ mt: 1.5, py: 0.5 }}>
            No valid purchase line items found with quantity greater than 0.
          </Alert>
        )}
      </DialogContent>

      {/* Dialog Footer */}
      <DialogActions
        sx={{
          p: 2,
          px: 2.5,
          borderTop: '1px solid #e2e8f0',
          bgcolor: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Chip
            color="primary"
            variant="outlined"
            label={`${totalSelectedItems} Item(s) Selected`}
            sx={{ fontWeight: 600, fontSize: '0.75rem' }}
          />
          <Chip
            sx={{
              bgcolor: '#7c3aed',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.75rem',
            }}
            label={`Total Labels: ${totalLabelsToPrint}`}
          />
          <Chip
            variant="outlined"
            size="small"
            label={
              paperFeedMode === 'thermal'
                ? 'Roll: Continuous'
                : paperFeedMode === 'a4_sheet'
                ? 'Paper: A4 Sheet Grid'
                : 'Paper: A4 Top-Left'
            }
            sx={{ fontSize: '0.72rem', fontWeight: 600, color: '#475569' }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            onClick={onClose}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              color: '#64748b',
              borderRadius: 1.5,
              px: 2,
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            startIcon={<LocalPrintshopIcon />}
            disabled={totalLabelsToPrint <= 0}
            onClick={handleExecutePrint}
            sx={{
              bgcolor: '#7c3aed',
              color: '#ffffff',
              borderRadius: 1.5,
              textTransform: 'none',
              fontWeight: 700,
              px: 2.5,
              boxShadow: 'none',
              '&:hover': { bgcolor: '#6d28d9' },
              '&.Mui-disabled': { bgcolor: '#cbd5e1', color: '#94a3b8' },
            }}
          >
            Print Barcode ({totalLabelsToPrint})
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
