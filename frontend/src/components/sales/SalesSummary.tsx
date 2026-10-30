import { Typography, TextField, Grid, Paper, Box, Checkbox, Tooltip } from '@mui/material';

interface SalesSummaryProps {
    grossAmount: number;
    totalVat: number;
    grandTotal: number;
    otherDiscPercent: number;
    otherDiscount: number;
    otherCharges: number;
    freightCharge: number;
    roundOff: number;
    autoRoundOff?: boolean;

    setOtherDiscPercent: (val: number) => void;
    setOtherDiscount: (val: number) => void;
    setOtherCharges: (val: number) => void;
    setFreightCharge: (val: number) => void;
    setRoundOff: (val: number) => void;
    handleAutoRoundOffToggle?: (checked: boolean) => void;

    narration: string;
    setNarration: (val: string) => void;
}

const SalesSummary: React.FC<SalesSummaryProps> = ({
    grossAmount,
    totalVat,
    grandTotal,
    otherDiscPercent,
    otherDiscount,
    otherCharges,
    freightCharge,
    roundOff,
    autoRoundOff,
    setOtherDiscPercent,
    setOtherDiscount,
    setOtherCharges,
    setFreightCharge,
    setRoundOff,
    handleAutoRoundOffToggle,
    narration,
    setNarration
}) => {
    return (
        <Grid container spacing={1}>
            {/* Left Side: Narration */}
            <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 1, height: '100%', bgcolor: 'white', borderRadius: 1.2, border: '1px solid #e2e8f0' }}>
                    <Typography sx={{ fontWeight: 600, color: '#1e293b', mb: 0.4, fontSize: '0.70rem' }}>Narration</Typography>
                    <TextField
                        multiline
                        rows={3}
                        fullWidth
                        value={narration}
                        onChange={(e) => setNarration(e.target.value)}
                        placeholder="Notes..."
                        sx={{
                            '& .MuiOutlinedInput-root': { borderRadius: 1.2 },
                            '& .MuiInputBase-input': { fontSize: '0.72rem', py: 0.5 }
                        }}
                    />
                </Paper>
            </Grid>

            {/* Right Side: Summary Calc Map */}
            <Grid item xs={12} md={6}>
                <Paper elevation={0} sx={{ p: 1.25, bgcolor: 'white', borderRadius: 1.2, border: '1px solid #e2e8f0' }}>
                    <Typography sx={{ fontWeight: 600, color: '#1e293b', mb: 0.6, fontSize: '0.78rem' }}>Summary</Typography>
                    <Grid container spacing={0.85}>
                        <Grid item xs={6}>
                            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mb: 0.3 }}>Other Disc %</Typography>
                            <TextField
                                size="small"
                                type="number"
                                value={otherDiscPercent === 0 ? '' : otherDiscPercent}
                                onChange={(e) => setOtherDiscPercent(parseFloat(e.target.value) || 0)}
                                fullWidth
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32 }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' } }}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mb: 0.3 }}>Other Discount</Typography>
                            <TextField
                                size="small"
                                type="number"
                                value={otherDiscount === 0 ? '' : otherDiscount}
                                onChange={(e) => setOtherDiscount(parseFloat(e.target.value) || 0)}
                                fullWidth
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32 }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' } }}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mb: 0.3 }}>Other Charges</Typography>
                            <TextField
                                size="small"
                                type="number"
                                value={otherCharges === 0 ? '' : otherCharges}
                                onChange={(e) => setOtherCharges(parseFloat(e.target.value) || 0)}
                                fullWidth
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32 }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' } }}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mb: 0.3 }}>Freight</Typography>
                            <TextField
                                size="small"
                                type="number"
                                value={freightCharge === 0 ? '' : freightCharge}
                                onChange={(e) => setFreightCharge(parseFloat(e.target.value) || 0)}
                                fullWidth
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32 }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' } }}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.3 }}>
                                <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>Round Off</Typography>
                                {handleAutoRoundOffToggle && (
                                    <Tooltip title="Round Off Total (Auto Round)" arrow placement="top">
                                        <Checkbox
                                            size="small"
                                            checked={!!autoRoundOff}
                                            onChange={(e) => handleAutoRoundOffToggle(e.target.checked)}
                                            sx={{
                                                p: 0,
                                                color: '#94a3b8',
                                                '&.Mui-checked': { color: '#0f766e' },
                                                '& .MuiSvgIcon-root': { fontSize: '1rem' },
                                            }}
                                        />
                                    </Tooltip>
                                )}
                            </Box>
                            <TextField
                                size="small"
                                type="number"
                                value={roundOff === 0 ? '' : roundOff}
                                onChange={(e) => {
                                    if (handleAutoRoundOffToggle) handleAutoRoundOffToggle(false);
                                    setRoundOff(parseFloat(e.target.value) || 0);
                                }}
                                fullWidth
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32 }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' } }}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mb: 0.3 }}>Gross Total</Typography>
                            <TextField
                                size="small"
                                value={grossAmount.toFixed(2)}
                                InputProps={{ readOnly: true }}
                                fullWidth
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' } }}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mb: 0.3 }}>Total VAT</Typography>
                            <TextField
                                size="small"
                                value={totalVat.toFixed(2)}
                                InputProps={{ readOnly: true }}
                                fullWidth
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 32, bgcolor: '#f8fafc' }, '& .MuiInputBase-input': { fontSize: '0.84rem', py: '4px !important' } }}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Typography sx={{ fontSize: '0.75rem', color: '#64748b', mb: 0.3 }}>Grand Total</Typography>
                            <TextField
                                size="small"
                                value={grandTotal.toFixed(2)}
                                InputProps={{ readOnly: true }}
                                fullWidth
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.2, height: 34, bgcolor: '#0f766e' }, '& .MuiInputBase-input': { fontWeight: 700, color: 'white', fontSize: '0.90rem', py: 0 } }}
                            />
                        </Grid>
                    </Grid>
                </Paper>
            </Grid>
        </Grid>
    );
};

export default SalesSummary;
