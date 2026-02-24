import React, { useRef } from 'react';
import {
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    TextField, IconButton, Autocomplete, MenuItem, Box, Paper,
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';
import { LineItem, Product, UnitOption } from '../../types/sales';

interface SalesGridProps {
    lines: LineItem[];
    products: Product[];
    onUpdateLine: (id: string, field: keyof LineItem, value: any) => void;
    onRemoveLine: (id: string) => void;
    onProductSelect: (lineId: string, product: Product | null) => void;
    onUnitChange: (lineId: string, unitId: string) => void;
    onKeyDown?: (e: React.KeyboardEvent, lineId: string) => void;
    activeLineId: string | null;
    setActiveLineId: (id: string | null) => void;
}

const headerStyle = {
    background: '#d53e4f', color: 'white', fontWeight: 600, p: 0.5, textAlign: 'center', fontSize: '0.75rem'
};

const SalesGrid: React.FC<SalesGridProps> = ({
    lines,
    products,
    onUpdateLine,
    onRemoveLine,
    onProductSelect,
    onUnitChange,
    onKeyDown,
    activeLineId,
    setActiveLineId,
}) => {
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const handleFocus = (lineId: string) => {
        setActiveLineId(lineId);
    };

    return (
        <Paper elevation={0} sx={{ mb: 0.5, bgcolor: 'white', borderRadius: 2, border: '2px solid #000000', overflow: 'hidden' }}>
            <TableContainer ref={tableContainerRef} sx={{ minHeight: 320, maxHeight: 400, width: '100%', bgcolor: '#f4f6f8' }}>
                <Table stickyHeader size="small" sx={{ minWidth: '100%', '& .MuiTableCell-root': { fontSize: '0.78rem' }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ ...headerStyle, width: '3%' }}>Sl</TableCell>
                            <TableCell sx={{ ...headerStyle, width: '10%' }}>Code</TableCell>
                            <TableCell sx={{ ...headerStyle, width: '14%' }}>Item Name</TableCell>
                            <TableCell sx={{ ...headerStyle, width: '6%' }}>Unit</TableCell>
                            <TableCell sx={{ ...headerStyle, width: '5%' }}>Qty</TableCell>
                            <TableCell sx={{ ...headerStyle, width: '10%' }}>Price</TableCell>
                            <TableCell sx={{ ...headerStyle, width: '8%' }}>Disc%</TableCell>
                            <TableCell sx={{ ...headerStyle, width: '8%' }}>Disc Amt</TableCell>
                            <TableCell sx={{ ...headerStyle, width: '8%' }}>VAT</TableCell>
                            <TableCell sx={{ ...headerStyle, width: '10%' }}>Total</TableCell>
                            <TableCell sx={{ ...headerStyle, width: '3%' }}></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {lines.map((line, index) => (
                            <TableRow
                                key={line.id}
                                onFocus={() => handleFocus(line.id)}
                                sx={{ bgcolor: index % 2 === 0 ? '#f8fafc' : 'white', '&:hover': { bgcolor: '#e0f2fe' } }}
                            >
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', textAlign: 'center' }}>{index + 1}</TableCell>
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                                    <TextField
                                        size="small"
                                        value={line.productCode}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                                        fullWidth
                                        onKeyDown={(e) => onKeyDown?.(e, line.id)}
                                    />
                                </TableCell>
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                                    <Autocomplete
                                        size="small"
                                        options={products}
                                        getOptionLabel={(p) => p.name || ''}
                                        value={products.find(p => p._id === line.productId) || null as any}
                                        onChange={(_, v) => onProductSelect(line.id, v)}
                                        disableClearable
                                        renderInput={(params) => (
                                            <TextField {...params} placeholder="Item Name" sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }} />
                                        )}
                                    />
                                </TableCell>
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                                    <TextField
                                        select
                                        size="small"
                                        fullWidth
                                        value={line.unitId}
                                        onChange={(e) => onUnitChange(line.id, e.target.value)}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 }, '& .MuiInputBase-input': { fontSize: '0.78rem' } }}
                                    >
                                        {line.availableUnits.map(u => (
                                            <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>
                                        ))}
                                    </TextField>
                                </TableCell>
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="number"
                                        value={line.quantity || ''}
                                        onChange={(e) => onUpdateLine(line.id, 'quantity', parseFloat(e.target.value) || 0)}
                                        inputProps={{ style: { textAlign: 'right', fontSize: '0.78rem' } }}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                                    />
                                </TableCell>
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="number"
                                        value={line.price || ''}
                                        onChange={(e) => onUpdateLine(line.id, 'price', parseFloat(e.target.value) || 0)}
                                        inputProps={{ style: { textAlign: 'right', fontSize: '0.78rem' } }}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                                    />
                                </TableCell>
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="number"
                                        value={line.discPercent || ''}
                                        onChange={(e) => onUpdateLine(line.id, 'discPercent', parseFloat(e.target.value) || 0)}
                                        inputProps={{ style: { textAlign: 'right', fontSize: '0.78rem' } }}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'white', borderRadius: 1 } }}
                                    />
                                </TableCell>
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="number"
                                        value={line.discAmount || ''}
                                        onChange={(e) => onUpdateLine(line.id, 'discAmount', parseFloat(e.target.value) || 0)}
                                        inputProps={{ style: { textAlign: 'right', fontSize: '0.78rem' }, readOnly: true }}
                                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#f1f5f9', borderRadius: 1 } }}
                                    />
                                </TableCell>
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontSize: '0.78rem', textAlign: 'right' }}>
                                    {line.vatAmount.toFixed(2)}
                                </TableCell>
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '0.78rem', textAlign: 'right' }}>
                                    {line.total.toFixed(2)}
                                </TableCell>
                                <TableCell sx={{ p: 0.5, borderBottom: '1px solid #e2e8f0' }}>
                                    <IconButton onClick={() => onRemoveLine(line.id)} size="small" sx={{ p: 0.3, color: '#94a3b8', '&:hover': { color: '#ef4444' } }}>
                                        <DeleteIcon sx={{ fontSize: '1rem' }} />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
};

export default SalesGrid;
