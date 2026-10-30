import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  IconButton,
  MenuItem,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PrintIcon from '@mui/icons-material/Print';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import { useAppSelector } from '../store/hooks';
import { productApi } from '../services/api';
import PurchaseBarcodePrintDialog, { PurchaseBarcodeItem } from '../components/PurchaseBarcodePrintDialog';
import { GRAD, GRAD_HOVER, INK, LINE, ROSE, ROSE_DEEP, ROSE_SOFT, SUB, WHITE_CARD } from '../theme/nexora';

type PriceType = 'retail' | 'wholesale' | 'special1' | 'special2';
type TableField = 'code' | 'barcode' | 'name' | 'qty';

const PRICE_TYPES: Array<{ id: PriceType; label: string }> = [
  { id: 'retail', label: 'Retail' },
  { id: 'wholesale', label: 'Wholesale' },
  { id: 'special1', label: 'Special 1' },
  { id: 'special2', label: 'Special 2' },
];

interface ProductRec {
  _id: string;
  code?: string;
  name?: string;
  imei?: string;
  genericName?: string;
  retailPrice?: number;
  wholesalePrice?: number;
  specialPrice?: number;
  specialPrice2?: number;
  mrp?: number;
  unitOfMeasureId?: { name?: string } | string;
}

interface Row {
  id: string;
  code: string;
  barcode: string;
  name: string;
  product: ProductRec | null;
  qty: string;
  isCommitted: boolean;
}

const makeRow = (): Row => ({
  id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  code: '',
  barcode: '',
  name: '',
  product: null,
  qty: '',
  isCommitted: false,
});

const priceOf = (product: ProductRec | null, type: PriceType): number | null => {
  if (!product) return null;
  const raw =
    type === 'retail'
      ? product.retailPrice
      : type === 'wholesale'
      ? product.wholesalePrice
      : type === 'special1'
      ? product.specialPrice
      : product.specialPrice2;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const unitOf = (product: ProductRec | null): string =>
  product && typeof product.unitOfMeasureId === 'object' ? product.unitOfMeasureId?.name ?? '' : '';

const thSx = {
  color: '#FFFFFF',
  fontWeight: 800,
  fontSize: 10.5,
  letterSpacing: '0.09em',
  textTransform: 'uppercase' as const,
  textAlign: 'center' as const,
  py: 1.1,
  borderColor: 'transparent',
  bgcolor: 'transparent',
  whiteSpace: 'nowrap' as const,
};

const cellSx = {
  borderColor: LINE,
  fontSize: 13,
  color: INK,
  py: 0.55,
  px: 1,
};

const scanFieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: '#FFFFFF',
    height: 34,
    fontSize: 13,
    fontWeight: 600,
    borderRadius: '10px',
    transition: 'box-shadow .18s ease',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(30,41,59,0.14)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(225,29,72,0.45)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: ROSE },
    '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(225,29,72,0.12)' },
    '& input': { padding: '6px 10px' },
  },
};

const nameFieldSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: '#FFFFFF',
    minHeight: 34,
    height: 34,
    fontSize: 13,
    fontWeight: 600,
    borderRadius: '10px',
    padding: '0 6px !important',
    transition: 'box-shadow .18s ease',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(30,41,59,0.14)' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(225,29,72,0.45)' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: ROSE },
    '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(225,29,72,0.12)' },
    '& input': { padding: '6px 8px !important' },
  },
};

export default function BulkBarcodePrint() {
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const [products, setProducts] = useState<ProductRec[]>([]);
  const [rows, setRows] = useState<Row[]>(() => [makeRow()]);
  const [priceType, setPriceType] = useState<PriceType>('retail');
  const [printOpen, setPrintOpen] = useState(false);
  const [toast, setToast] = useState<{ severity: 'success' | 'warning' | 'error'; msg: string } | null>(null);

  // Field refs for direct focus traversal
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const busyRef = useRef(false);
  const remoteCache = useRef(new Map<string, ProductRec>());

  // Sales B2C commit & snapshot refs
  const rowSnapshotRef = useRef<{ rowId: string; data: Row } | null>(null);
  const rowCommittedRef = useRef(false);
  const itemNameSnapshotRef = useRef<{ rowId: string; data: Row } | null>(null);
  const itemNameListboxOpenRef = useRef(false);
  const printButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    productApi
      .list(companyId, { limit: 10000 })
      .then((res) => {
        if (alive) setProducts((res.data.data?.products ?? []) as ProductRec[]);
      })
      .catch(() => {
        if (alive) setToast({ severity: 'error', msg: 'Could not load the product master.' });
      });
    return () => {
      alive = false;
    };
  }, [companyId]);

  useEffect(() => {
    inputRefs.current[`${rows[0].id}:barcode`]?.focus();
  }, []);

  const byImei = useMemo(() => {
    const map = new Map<string, ProductRec>();
    products.forEach((p) => {
      if (p.imei) map.set(String(p.imei).trim(), p);
    });
    return map;
  }, [products]);

  const byCode = useMemo(() => {
    const map = new Map<string, ProductRec>();
    products.forEach((p) => {
      if (p.code) map.set(String(p.code).trim().toLowerCase(), p);
    });
    return map;
  }, [products]);

  // Product filter options prioritizing exact startsWith, code, barcode, then substring match
  const productFilterOptions = useMemo(
    () => (options: ProductRec[], state: { inputValue: string }) => {
      const q = (state.inputValue || '').trim().toLowerCase();
      if (!q) return options.slice(0, 60);

      const name = (p: ProductRec) => (p.name || '').toLowerCase();
      const code = (p: ProductRec) => (p.code || '').toLowerCase();
      const imei = (p: ProductRec) => (p.imei || '').toLowerCase();
      const generic = (p: ProductRec) => (p.genericName || '').toLowerCase();

      const nameStartsWith: ProductRec[] = [];
      const codeStartsWith: ProductRec[] = [];
      const containsMatches: ProductRec[] = [];

      for (const p of options) {
        const pName = name(p);
        const pCode = code(p);
        const pImei = imei(p);
        const pGen = generic(p);

        if (pName.startsWith(q)) {
          nameStartsWith.push(p);
        } else if (pCode.startsWith(q) || pImei.startsWith(q)) {
          codeStartsWith.push(p);
        } else if (pName.includes(q) || pCode.includes(q) || pImei.includes(q) || pGen.includes(q)) {
          containsMatches.push(p);
        }
      }

      const sortByName = (arr: ProductRec[]) =>
        arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));

      return [...sortByName(nameStartsWith), ...sortByName(codeStartsWith), ...sortByName(containsMatches)].slice(0, 100);
    },
    []
  );

  const focusField = (rowId: string, field: TableField) => {
    window.setTimeout(() => {
      const el = inputRefs.current[`${rowId}:${field}`];
      el?.focus();
      el?.select?.();
    }, 60);
  };

  /* ════════════════════════════════════════════════════════════ */
  /*  SALES B2C ROW COMMIT & SNAPSHOT LOGIC                       */
  /* ════════════════════════════════════════════════════════════ */

  // Revert uncommitted row edits back to original snapshot
  const revertUncommittedRow = useCallback(() => {
    if (rowSnapshotRef.current && !rowCommittedRef.current) {
      const snapshot = rowSnapshotRef.current;
      setRows((prev) =>
        prev.map((r) => (r.id === snapshot.rowId ? { ...snapshot.data } : r))
      );
    }
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
  }, []);

  // Enter row (called on row click or field focus)
  const enterRow = useCallback(
    (row: Row) => {
      if (rowSnapshotRef.current && rowSnapshotRef.current.rowId === row.id) return;
      revertUncommittedRow();

      if (row.isCommitted) {
        rowSnapshotRef.current = {
          rowId: row.id,
          data: { ...row },
        };
        rowCommittedRef.current = false;
      }
    },
    [revertUncommittedRow]
  );

  // Commit current row edits permanently
  const commitCurrentRow = useCallback((rowId: string) => {
    rowCommittedRef.current = true;
    rowSnapshotRef.current = null;
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, isCommitted: true } : r))
    );
  }, []);

  const appendRowAndFocus = () => {
    const created = makeRow();
    setRows((prev) => [...prev, created]);
    enterRow(created);
    focusField(created.id, 'barcode');
  };

  const unwrapProduct = (data: unknown): ProductRec | null => {
    if (!data || typeof data !== 'object') return null;
    const nested = (data as { product?: ProductRec }).product;
    const candidate = nested ?? (data as ProductRec);
    return candidate?._id ? candidate : null;
  };

  const lookup = async (term: string): Promise<ProductRec | null> => {
    const cached = remoteCache.current.get(term);
    if (cached) return cached;
    if (!companyId) return null;
    try {
      const byBarcode = await productApi.getByBarcode(companyId, term);
      const hit = unwrapProduct(byBarcode.data?.data);
      if (hit) return hit;
    } catch {
      // 404 is the normal "not found" response
    }
    try {
      const byImeiRes = await productApi.getByImei(companyId, term);
      const hit = unwrapProduct(byImeiRes.data?.data);
      if (hit) return hit;
    } catch {
      // 404 is the normal "not found" response
    }
    return null;
  };

  const resolveTerm = async (term: string): Promise<ProductRec | null> =>
    byImei.get(term) ?? byCode.get(term.toLowerCase()) ?? (await lookup(term));

  // Product selection handler for all entry points (Item Name Autocomplete, Barcode, Code)
  const handleSelectProduct = useCallback((rowId: string, product: ProductRec) => {
    if (product.imei) remoteCache.current.set(String(product.imei).trim(), product);
    if (product.code) remoteCache.current.set(String(product.code).trim(), product);

    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        return {
          ...r,
          product,
          name: product.name ?? '',
          code: product.code ?? r.code,
          barcode: product.imei ?? product.code ?? r.barcode,
          qty: Number(r.qty) > 0 ? r.qty : '1',
        };
      })
    );
    // Smoothly focus Qty field so user can adjust quantity or press Enter to commit
    focusField(rowId, 'qty');
  }, []);

  // Barcode and Item Code scan / enter handler
  const handleScanEnter = async (rowId: string, field: 'code' | 'barcode', raw: string) => {
    const term = raw.trim();

    if (!term) {
      if (field === 'code') {
        focusField(rowId, 'barcode');
      } else {
        // If barcode field is empty (no saved barcode), press Enter -> go to Item Name field
        focusField(rowId, 'name');
      }
      return;
    }

    if (busyRef.current) return;
    busyRef.current = true;
    const product = await resolveTerm(term);
    busyRef.current = false;

    if (!product) {
      if (field === 'barcode') {
        // Barcode is not saved in the system -> notify and go to Item Name field
        setToast({ severity: 'warning', msg: `Barcode "${term}" is not saved. Select product from Item Name.` });
        focusField(rowId, 'name');
      } else {
        setToast({ severity: 'error', msg: `Item code "${term}" not found.` });
        focusField(rowId, 'barcode');
      }
      return;
    }

    handleSelectProduct(rowId, product);
  };

  // Item Name keyboard navigation handler
  const handleItemNameKeyDown = useCallback(
    (e: React.KeyboardEvent, row: Row) => {
      if (e.key === 'Enter') {
        // When list is open and typed value is a prefix of some product, let Autocomplete handle Enter
        if (itemNameListboxOpenRef.current && row.name.trim()) {
          const typed = row.name.trim().toLowerCase();
          const isPrefixOfAny = products.some(
            (p) => p.name && String(p.name).trim().toLowerCase().startsWith(typed)
          );
          if (isPrefixOfAny) return;
        }

        const inputEl =
          (e.target as HTMLElement)?.closest?.('input') ||
          (e.target as HTMLInputElement) ||
          inputRefs.current[`${row.id}:name`];
        const currentTyped = (inputEl && 'value' in inputEl ? (inputEl as HTMLInputElement).value : row.name) ?? '';
        const typed = currentTyped.trim();

        // If user typed an exact match (by name, code, or barcode)
        if (typed) {
          const exactMatch =
            products.find((p) => p.name?.trim().toLowerCase() === typed.toLowerCase()) ||
            products.find((p) => p.code?.trim().toLowerCase() === typed.toLowerCase()) ||
            products.find((p) => p.imei && String(p.imei).trim() === typed);

          if (exactMatch && (!row.product || row.product._id !== exactMatch._id)) {
            e.preventDefault();
            e.stopPropagation();
            handleSelectProduct(row.id, exactMatch);
            return;
          }
        }

        // If row already has a product, Enter advances to Qty field
        if (row.product) {
          e.preventDefault();
          e.stopPropagation();
          focusField(row.id, 'qty');
          return;
        }

        // If item name is blank and no product on last row -> focus Print Barcode button
        if (!row.product && !typed) {
          const currentIndex = rows.findIndex((r) => r.id === row.id);
          if (currentIndex === rows.length - 1) {
            e.preventDefault();
            e.stopPropagation();
            printButtonRef.current?.focus();
            return;
          }
        }
      }
    },
    [products, rows, handleSelectProduct]
  );

  const handleItemNameFocus = useCallback(
    (row: Row) => {
      enterRow(row);
      itemNameSnapshotRef.current = { rowId: row.id, data: { ...row } };
    },
    [enterRow]
  );

  const handleItemNameBlur = useCallback((row: Row) => {
    // If row was not committed and user cleared product without selecting another, revert from snapshot
    if (
      !row.isCommitted &&
      itemNameSnapshotRef.current &&
      itemNameSnapshotRef.current.rowId === row.id &&
      !row.product
    ) {
      const snapshot = itemNameSnapshotRef.current.data;
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...snapshot } : r)));
    }
    itemNameSnapshotRef.current = null;
  }, []);

  // Enter key on Qty field: validates, commits row edits, and advances to next row (Sales B2C pattern)
  const handleQtyKeyDown = (e: React.KeyboardEvent, row: Row) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const idx = rows.findIndex((r) => r.id === row.id);
    const isLastRow = idx === rows.length - 1;
    const currentQty = Number(row.qty);

    // If last row and blank or invalid, focus Print Barcode button
    if ((!row.product || currentQty <= 0) && isLastRow) {
      printButtonRef.current?.focus();
      return;
    }

    // If valid product and qty > 0, commit current row and advance
    if (row.product && currentQty > 0) {
      commitCurrentRow(row.id);
      if (!isLastRow) {
        const nextRow = rows[idx + 1];
        enterRow(nextRow);
        focusField(nextRow.id, 'barcode');
      } else {
        appendRowAndFocus();
      }
    } else if (!row.product) {
      focusField(row.id, 'name');
    } else {
      focusField(row.id, 'qty');
    }
  };

  const handleDeleteRow = (rowId: string) => {
    if (rowSnapshotRef.current?.rowId === rowId) {
      rowSnapshotRef.current = null;
      rowCommittedRef.current = false;
    }
    if (itemNameSnapshotRef.current?.rowId === rowId) {
      itemNameSnapshotRef.current = null;
    }
    setRows((prev) => {
      const next = prev.filter((r) => r.id !== rowId);
      if (next.length > 0) return next;
      const created = makeRow();
      enterRow(created);
      focusField(created.id, 'barcode');
      return [created];
    });
  };

  const handleClear = () => {
    rowSnapshotRef.current = null;
    rowCommittedRef.current = false;
    itemNameSnapshotRef.current = null;
    const created = makeRow();
    setRows([created]);
    enterRow(created);
    focusField(created.id, 'barcode');
  };

  const priceLabel = PRICE_TYPES.find((t) => t.id === priceType)?.label ?? 'Retail';

  const scanned = rows.filter((r) => r.product && Number(r.qty) > 0);
  const printLines = useMemo<PurchaseBarcodeItem[]>(() => {
    return scanned
      .map((r): PurchaseBarcodeItem | null => {
        const price = priceOf(r.product, priceType);
        if (!price || !r.product) return null;
        return {
          id: r.id,
          productId: r.product._id,
          productCode: r.product.code,
          imei: r.barcode || r.product.imei || r.product.code,
          name: r.product.name ?? r.name ?? '',
          quantity: Math.max(1, Math.round(Number(r.qty))),
          retail: price,
          wholesale: Number(r.product.mrp) || price,
          mrp: r.product.mrp,
          unitName: unitOf(r.product),
        };
      })
      .filter((line): line is PurchaseBarcodeItem => line !== null);
  }, [scanned, priceType]);

  const missingPrice = scanned.length - printLines.length;
  const totalLabels = printLines.reduce((sum, line) => sum + line.quantity, 0);

  const handlePrint = () => {
    if (printLines.length === 0) {
      setToast({ severity: 'warning', msg: 'Scan or select at least one priced item before printing.' });
      return;
    }
    if (missingPrice > 0) {
      setToast({ severity: 'warning', msg: `${missingPrice} item(s) have no ${priceLabel} price and were skipped.` });
    }
    setPrintOpen(true);
  };

  return (
    <Box sx={{ maxWidth: 1240, mx: 'auto' }}>
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          bgcolor: '#FFFFFF',
          border: `1px solid ${LINE}`,
          borderRadius: 4,
          boxShadow: WHITE_CARD,
          mb: 2,
          px: { xs: 2, sm: 2.75 },
          py: 2.25,
        }}
      >
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: GRAD }} />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 2 }}>
          <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                bgcolor: ROSE_SOFT,
                color: ROSE_DEEP,
                borderRadius: '999px',
                px: 1.25,
                py: 0.5,
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              <QrCode2Icon sx={{ fontSize: 15 }} />
              Price stickers
            </Box>
            <Typography sx={{ fontWeight: 800, color: INK, letterSpacing: -0.6, fontSize: 26, mt: 1.25 }}>
              Bulk Barcode Print
            </Typography>
            <Typography variant="body2" sx={{ color: SUB, mt: 0.4, fontSize: 13 }}>
              Scan a barcode or search by item name. Press Enter on quantity to commit the item and advance to the next line.
            </Typography>
          </Box>

          <Box sx={{ flex: '0 0 auto', display: 'flex', alignItems: 'flex-end', gap: 1.5, flexWrap: 'wrap' }}>
            <TextField
              select
              size="small"
              label="Price type"
              value={priceType}
              onChange={(e) => setPriceType(e.target.value as PriceType)}
              sx={{
                width: 160,
                '& .MuiInputLabel-root': { color: SUB, fontWeight: 600, fontSize: 13 },
                '& .MuiInputLabel-root.Mui-focused': { color: ROSE, fontWeight: 700 },
                '& .MuiOutlinedInput-root': {
                  bgcolor: '#FFFDF8',
                  borderRadius: '12px',
                  fontSize: 13,
                  fontWeight: 700,
                  color: INK,
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(30,41,59,0.14)' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(225,29,72,0.5)' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: ROSE },
                  '&.Mui-focused': { boxShadow: '0 0 0 3px rgba(225,29,72,0.12)' },
                },
              }}
              SelectProps={{
                MenuProps: {
                  PaperProps: { sx: { borderRadius: 2, border: `1px solid ${LINE}`, bgcolor: '#FFFDF8', mt: 0.25 } },
                },
              }}
            >
              {PRICE_TYPES.map((type) => (
                <MenuItem key={type.id} value={type.id} sx={{ fontSize: 13, fontWeight: 600, '&:hover': { bgcolor: ROSE_SOFT } }}>
                  {type.label}
                </MenuItem>
              ))}
            </TextField>

            <Button
              size="small"
              startIcon={<ClearAllIcon sx={{ fontSize: 17 }} />}
              onClick={handleClear}
              sx={{
                height: 40,
                px: 2,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: 13.5,
                color: ROSE_DEEP,
                bgcolor: '#FFFFFF',
                border: `1px solid ${LINE}`,
                borderRadius: '12px',
                boxShadow: 'none',
                transition: 'background-color .2s ease, border-color .2s ease',
                '&:hover': { bgcolor: ROSE_SOFT, borderColor: 'rgba(225,29,72,0.4)' },
              }}
            >
              Clear
            </Button>

            <Button
              ref={printButtonRef}
              size="small"
              startIcon={<PrintIcon sx={{ fontSize: 17 }} />}
              onClick={handlePrint}
              disabled={printLines.length === 0}
              sx={{
                height: 40,
                px: 2.25,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: 13.5,
                color: '#FFFFFF',
                background: GRAD,
                borderRadius: '12px',
                boxShadow: '0 14px 28px -12px rgba(225,29,72,0.6)',
                transition: 'box-shadow .2s ease, filter .2s ease',
                '&:hover': { background: GRAD_HOVER, boxShadow: '0 18px 32px -12px rgba(225,29,72,0.7)' },
                '&.Mui-disabled': { background: 'rgba(30,41,59,0.10)', color: 'rgba(30,41,59,0.35)' },
              }}
            >
              Print Barcode
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2, flexWrap: 'wrap' }}>
          <Chip size="small" label={`${printLines.length} item${printLines.length === 1 ? '' : 's'}`} sx={{ fontWeight: 700, fontSize: 11.5 }} />
          <Chip size="small" label={`${totalLabels} label${totalLabels === 1 ? '' : 's'}`} sx={{ fontWeight: 700, fontSize: 11.5 }} />
          <Chip
            size="small"
            label={`${priceLabel} price`}
            sx={{ fontWeight: 700, fontSize: 11.5, bgcolor: ROSE_SOFT, color: ROSE_DEEP }}
          />
          {missingPrice > 0 && (
            <Chip
              size="small"
              label={`${missingPrice} without ${priceLabel} price`}
              sx={{ fontWeight: 700, fontSize: 11.5, bgcolor: '#FFF7E6', color: '#B45309' }}
            />
          )}
        </Box>
      </Box>

      <Box
        sx={{
          bgcolor: '#FFFFFF',
          border: `1px solid ${LINE}`,
          borderRadius: 4,
          boxShadow: WHITE_CARD,
          overflow: 'hidden',
        }}
      >
        <TableContainer sx={{ maxHeight: 'calc(100vh - 300px)' }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow sx={{ background: GRAD, '& .MuiTableCell-root': { bgcolor: 'transparent' } }}>
                <TableCell align="center" sx={{ ...thSx, width: 60 }}>Sl No</TableCell>
                <TableCell sx={{ ...thSx, textAlign: 'left', width: 140 }}>Item Code</TableCell>
                <TableCell sx={{ ...thSx, textAlign: 'left', width: 160 }}>Barcode</TableCell>
                <TableCell sx={{ ...thSx, textAlign: 'left', minWidth: 260 }}>Item Name</TableCell>
                <TableCell sx={{ ...thSx, textAlign: 'left', minWidth: 160 }}>Item Official Name</TableCell>
                <TableCell align="right" sx={{ ...thSx, width: 120 }}>Price Sticker</TableCell>
                <TableCell align="center" sx={{ ...thSx, width: 90 }}>Qty</TableCell>
                <TableCell align="center" sx={{ ...thSx, width: 50 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, idx) => {
                const price = priceOf(row.product, priceType);
                const isCommittedValid = row.isCommitted && row.product;
                return (
                  <TableRow
                    key={row.id}
                    hover
                    onClick={() => enterRow(row)}
                    sx={{
                      bgcolor: isCommittedValid
                        ? 'rgba(15, 118, 110, 0.04)'
                        : row.product
                        ? 'rgba(225, 29, 72, 0.035)'
                        : 'transparent',
                      transition: 'background-color .18s ease',
                      '&:hover .MuiTableCell-root': { bgcolor: 'transparent' },
                    }}
                  >
                    <TableCell align="center" sx={{ ...cellSx, color: SUB, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                        <span>{idx + 1}</span>
                        {isCommittedValid && (
                          <CheckCircleOutlineIcon sx={{ fontSize: 13, color: '#0f766e' }} titleAccess="Committed row" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <TextField
                        inputRef={(el) => {
                          inputRefs.current[`${row.id}:code`] = el;
                        }}
                        value={row.code}
                        onFocus={() => enterRow(row)}
                        onChange={(e) => setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, code: e.target.value } : r)))}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          void handleScanEnter(row.id, 'code', row.code);
                        }}
                        placeholder="Item code"
                        variant="outlined"
                        size="small"
                        fullWidth
                        sx={scanFieldSx}
                      />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <TextField
                        inputRef={(el) => {
                          inputRefs.current[`${row.id}:barcode`] = el;
                        }}
                        value={row.barcode}
                        onFocus={() => enterRow(row)}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((r) => (r.id === row.id ? { ...r, barcode: e.target.value } : r))
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          void handleScanEnter(row.id, 'barcode', row.barcode);
                        }}
                        placeholder="Scan barcode"
                        variant="outlined"
                        size="small"
                        fullWidth
                        autoFocus={idx === 0}
                        sx={scanFieldSx}
                      />
                    </TableCell>

                    {/* Item Name Autocomplete (Sales B2C pattern) */}
                    <TableCell sx={{ ...cellSx, minWidth: 260 }} onClick={(e) => e.stopPropagation()}>
                      <Autocomplete
                        size="small"
                        freeSolo
                        options={products}
                        filterOptions={productFilterOptions}
                        isOptionEqualToValue={(opt, val) =>
                          typeof opt === 'string' || typeof val === 'string' ? false : opt._id === val._id
                        }
                        getOptionLabel={(opt) => (typeof opt === 'string' ? opt : opt.name || '')}
                        value={row.product}
                        inputValue={row.name}
                        onInputChange={(_, v, reason) => {
                          if (reason === 'reset') return;
                          if (v.trim() === '') {
                            setRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? { ...r, name: '', product: null, code: '', barcode: '', isCommitted: false }
                                  : r
                              )
                            );
                          } else {
                            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, name: v } : r)));
                          }
                        }}
                        onChange={(_, v) => {
                          if (v && typeof v !== 'string') {
                            handleSelectProduct(row.id, v);
                          }
                        }}
                        onOpen={() => {
                          itemNameListboxOpenRef.current = true;
                        }}
                        onClose={() => {
                          itemNameListboxOpenRef.current = false;
                        }}
                        autoHighlight
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            placeholder="Search item name..."
                            variant="outlined"
                            size="small"
                            fullWidth
                            inputRef={(el) => {
                              inputRefs.current[`${row.id}:name`] = el;
                            }}
                            onFocus={() => handleItemNameFocus(row)}
                            onBlur={() => handleItemNameBlur(row)}
                            onKeyDown={(e) => handleItemNameKeyDown(e, row)}
                            sx={nameFieldSx}
                          />
                        )}
                        renderOption={(props, opt) => (
                          <li
                            {...props}
                            key={opt._id}
                            style={{
                              fontSize: 12.5,
                              padding: '6px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                              borderBottom: '1px solid rgba(0,0,0,0.04)',
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                              <Typography sx={{ fontSize: 13, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {opt.name}
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                                {opt.code && (
                                  <Chip
                                    label={opt.code}
                                    size="small"
                                    sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'rgba(30,41,59,0.06)', color: INK }}
                                  />
                                )}
                                {opt.imei && opt.imei !== opt.code && (
                                  <Chip
                                    label={opt.imei}
                                    size="small"
                                    sx={{ height: 18, fontSize: 10, fontWeight: 600, bgcolor: ROSE_SOFT, color: ROSE_DEEP }}
                                  />
                                )}
                              </Box>
                            </Box>
                            {opt.genericName && (
                              <Typography sx={{ fontSize: 11, color: SUB, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {opt.genericName}
                              </Typography>
                            )}
                          </li>
                        )}
                        ListboxProps={{
                          sx: {
                            p: 0.5,
                            maxHeight: 260,
                            borderRadius: 2,
                            boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
                            border: `1px solid ${LINE}`,
                            '& .MuiAutocomplete-option': {
                              borderRadius: '8px',
                              mb: 0.25,
                              '&[data-focus="true"]': { bgcolor: ROSE_SOFT, color: INK },
                              '&[aria-selected="true"]': { bgcolor: `${ROSE_SOFT} !important`, color: INK },
                              '&.Mui-focused': { bgcolor: ROSE_SOFT, color: INK },
                              '&:hover': { bgcolor: ROSE_SOFT },
                            },
                          },
                        }}
                      />
                    </TableCell>

                    <TableCell sx={{ ...cellSx, color: SUB }}>{row.product?.genericName ?? ''}</TableCell>
                    <TableCell
                      align="right"
                      sx={{
                        ...cellSx,
                        fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                        color: price == null ? (row.product ? '#B45309' : SUB) : ROSE_DEEP,
                      }}
                    >
                      {price == null ? (row.product ? '—' : '') : price.toFixed(2)}
                    </TableCell>
                    <TableCell align="center" sx={cellSx}>
                      <TextField
                        inputRef={(el) => {
                          inputRefs.current[`${row.id}:qty`] = el;
                        }}
                        value={row.qty}
                        onFocus={() => enterRow(row)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw !== '' && !/^\d*$/.test(raw)) return;
                          setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, qty: raw } : r)));
                        }}
                        onKeyDown={(e) => handleQtyKeyDown(e, row)}
                        placeholder="Qty"
                        variant="outlined"
                        size="small"
                        sx={{ ...scanFieldSx, width: 78, '& input': { textAlign: 'center' } }}
                        inputProps={{ inputMode: 'numeric', 'aria-label': 'Quantity' }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ ...cellSx, px: 0 }}>
                      <IconButton
                        size="small"
                        onClick={() => handleDeleteRow(row.id)}
                        disabled={!row.product && !row.barcode && !row.code && !row.qty}
                        title="Remove row"
                        sx={{ color: 'rgba(30,41,59,0.35)', '&:hover': { color: ROSE, bgcolor: ROSE_SOFT } }}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      <PurchaseBarcodePrintDialog
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        documentTitle="Bulk Barcode Print"
        lines={printLines}
        products={products}
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toast?.severity ?? 'info'}
          onClose={() => setToast(null)}
          sx={{ borderRadius: 3, bgcolor: toast?.severity === 'error' ? '#FEF2F2' : '#FFFFFF', color: INK, fontWeight: 600 }}
        >
          {toast?.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
