import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stepper,
  Step,
  StepLabel,
  Button,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  TextField,
  CircularProgress,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useAppSelector } from '../../store/hooks';
import { openingPurchaseApi } from '../../services/api';

const FIELDS = ['productCode', 'productName', 'barcode', 'category', 'quantity', 'cost', 'vendor'] as const;
const FIELD_LABELS: Record<string, string> = {
  productCode: 'Product Code',
  productName: 'Product Name',
  barcode: 'Barcode',
  category: 'Category',
  quantity: 'Quantity',
  cost: 'Cost (AED)',
  vendor: 'Vendor',
};

function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map((line) => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQuotes = !inQuotes;
      else if ((c === ',' && !inQuotes) || c === '\t') {
        result.push(current.trim());
        current = '';
      } else current += c;
    }
    result.push(current.trim());
    return result;
  });
}

export default function ImportOpeningPurchase() {
  const [activeStep, setActiveStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, number | undefined>>({});
  const [preview, setPreview] = useState<Array<Record<string, string | number>>>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const financialYearId = useAppSelector((s) => s.app.selectedFinancialYearId);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const parsed = parseCSV(text);
      if (parsed.length > 0) {
        setHeaders(parsed[0]);
        setRows(parsed.slice(1));
        setMapping({});
      }
    };
    reader.readAsText(f, 'UTF-8');
    setActiveStep(1);
  }, []);

  const handleConfirmMapping = () => {
    const mapped: Array<Record<string, string | number>> = [];
    const errs: string[] = [];
    rows.forEach((row, i) => {
      const qty = mapping.quantity !== undefined ? Number(row[mapping.quantity]) : NaN;
      const cost = mapping.cost !== undefined ? Number(row[mapping.cost]) : NaN;
      if (isNaN(qty) || qty < 0) errs.push(`Row ${i + 2}: Invalid quantity`);
      if (isNaN(cost) || cost < 0) errs.push(`Row ${i + 2}: Invalid cost`);
      mapped.push({
        productCode: mapping.productCode !== undefined ? row[mapping.productCode] ?? '' : '',
        productName: mapping.productName !== undefined ? row[mapping.productName] ?? '' : '',
        barcode: mapping.barcode !== undefined ? row[mapping.barcode] ?? '' : '',
        category: mapping.category !== undefined ? row[mapping.category] ?? '' : '',
        quantity: qty,
        cost: cost,
        vendor: mapping.vendor !== undefined ? row[mapping.vendor] ?? '' : '',
      });
    });
    setPreview(mapped);
    setErrors(errs);
    setActiveStep(2);
  };

  const handleImport = async () => {
    if (!companyId || !financialYearId) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await openingPurchaseApi.importProductsAndStock(companyId, financialYearId, {
        mapping: mapping as unknown as Record<string, number>,
        rows,
        headers,
      });
      const data = res.data.data as { created?: number; updated?: number; errors?: string[] };
      setResult({
        created: data?.created ?? 0,
        updated: data?.updated ?? 0,
        errors: data?.errors ?? [],
      });
      setActiveStep(3);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      setResult({ created: 0, updated: 0, errors: [err?.response?.data?.message ?? 'Import failed'] });
      setActiveStep(3);
    } finally {
      setLoading(false);
    }
  };

  if (!companyId) return <Typography color="error">Select a company first.</Typography>;
  if (!financialYearId) return <Typography color="error">Select a financial year first.</Typography>;

  const steps = ['Upload file', 'Column mapping', 'Validate & preview', 'Confirm import'];

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Import Opening Purchase Products</Typography>
      <Alert severity="info" sx={{ mb: 2 }}>
        Upload a CSV or Excel file with columns for product code, name, barcode, category, quantity, cost, and optional vendor.
        New products will be created where code/barcode does not exist; then opening purchase will be recorded.
      </Alert>
      <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
        {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
      </Stepper>

      {activeStep === 0 && (
        <Paper sx={{ p: 3 }}>
          <Typography paragraph>Choose a CSV file (comma or tab separated). First row will be treated as headers.</Typography>
          <Button component="label" variant="contained" startIcon={<UploadFileIcon />}>
            Select CSV file
            <input type="file" accept=".csv,.txt" hidden onChange={handleFile} />
          </Button>
        </Paper>
      )}

      {activeStep === 1 && file && (
        <Paper sx={{ p: 3 }}>
          <Typography gutterBottom>Map your columns to fields (headers: {headers.join(', ')})</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
            {FIELDS.map((field) => (
              <TextField
                key={field}
                select
                size="small"
                label={FIELD_LABELS[field]}
                value={mapping[field] ?? ''}
                onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="">— Skip —</MenuItem>
                {headers.map((h, i) => (
                  <MenuItem key={i} value={i}>{h}</MenuItem>
                ))}
              </TextField>
            ))}
          </Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Product Code and Quantity, Cost are required. Product Name recommended for new products.
          </Typography>
          <Button variant="contained" onClick={handleConfirmMapping} disabled={mapping.quantity === undefined || mapping.cost === undefined}>
            Preview
          </Button>
        </Paper>
      )}

      {activeStep === 2 && (
        <Paper sx={{ p: 3 }}>
          {errors.length > 0 && <Alert severity="warning" sx={{ mb: 2 }}>Validation issues: {errors.slice(0, 5).join('; ')}{errors.length > 5 ? '...' : ''}</Alert>}
          <Typography gutterBottom>Preview (first 20 rows)</Typography>
          <TableContainer sx={{ maxHeight: 400, mb: 2 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {FIELDS.map((f) => <TableCell key={f}>{FIELD_LABELS[f]}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.slice(0, 20).map((r, i) => (
                  <TableRow key={i}>
                    {FIELDS.map((f) => <TableCell key={f}>{r[f]}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="contained" onClick={handleImport} disabled={loading}>
              {loading ? <CircularProgress size={24} /> : 'Confirm & Import'}
            </Button>
            <Button onClick={() => setActiveStep(1)}>Back</Button>
          </Box>
        </Paper>
      )}

      {activeStep === 3 && result && (
        <Paper sx={{ p: 3 }}>
          <Alert severity={result.errors.length > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
            Import completed. Created: {result.created}, Updated: {result.updated}.
            {result.errors.length > 0 && ` Errors: ${result.errors.slice(0, 3).join('; ')}`}
          </Alert>
          <Button variant="contained" onClick={() => { setActiveStep(0); setFile(null); setRows([]); setPreview([]); setResult(null); }}>
            Import another file
          </Button>
        </Paper>
      )}
    </Box>
  );
}
