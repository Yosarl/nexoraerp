import React from 'react';
import { Box, Typography, Button, Paper, Grid } from '@mui/material';
import {
    KeyboardDoubleArrowLeft as FirstIcon,
    KeyboardArrowLeft as PrevIcon,
    KeyboardArrowRight as NextIcon,
    KeyboardDoubleArrowRight as LastIcon,
    Search as SearchIcon,
    Clear as ClearIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    Save as SaveIcon,
    Print as PrintIcon,
} from '@mui/icons-material';

interface SalesEntryLayoutProps {
    title: string;
    invoiceNo: string;
    onFirst?: () => void;
    onPrev?: () => void;
    onNext?: () => void;
    onLast?: () => void;
    onHold?: () => void;
    onHoldList?: () => void;
    onSearch?: () => void;
    onClear?: () => void;
    onDelete?: () => void;
    onEdit?: () => void;
    onSave?: () => void;
    onPrint?: () => void;
    heldCount?: number;
    isSaved?: boolean;
    isEditMode?: boolean;
    loading?: boolean;
    headerContent?: React.ReactNode;
    gridContent?: React.ReactNode;
    footerContent?: React.ReactNode;
    sidePanelContent?: React.ReactNode;
    children?: React.ReactNode;
    isReturn?: boolean;
}

const numberInputStyle = {
    '& input[type=number]': { MozAppearance: 'textfield' },
    '& input[type=number]::-webkit-outer-spin-button': { WebkitAppearance: 'none', margin: 0 },
    '& input[type=number]::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 }
};

const SalesEntryLayout: React.FC<SalesEntryLayoutProps> = ({
    title,
    invoiceNo,
    onFirst,
    onPrev,
    onNext,
    onLast,
    onHold: _onHold,
    onHoldList: _onHoldList,
    onSearch,
    onClear,
    onDelete,
    onEdit,
    onSave,
    onPrint,
    heldCount: _heldCount = 0,
    isSaved = false,
    isEditMode = false,
    loading = false,
    headerContent,
    gridContent,
    footerContent,
    sidePanelContent: _sidePanelContent,
    children,
    isReturn = false,
}) => {
    return (
        <Box
            sx={{
                p: 1.25,
                height: '100vh',
                bgcolor: '#f1f5f9',
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                '& .MuiInputLabel-root': { fontWeight: 600, color: '#1e293b' },
                ...numberInputStyle,
            }}
        >
            <Typography component="h1" variant="h6" sx={{ fontWeight: 700, color: '#0f766e', mb: 0.75, fontSize: '0.95rem' }}>
                {title}
            </Typography>

            {/* Header Card */}
            <Paper elevation={0} sx={{ px: 1.25, py: 0.8, mb: 0.7, borderRadius: 1.5, bgcolor: 'white', border: '1px solid #e0e7ef' }}>
                <Grid container spacing={1} alignItems="center">
                    <Grid item xs={6} sm={3} md={1.8} lg={1.3}>
                        <Box sx={{ bgcolor: '#0f766e', borderRadius: 1.2, px: 1, py: 0.35, textAlign: 'center' }}>
                            <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.58rem', fontWeight: 500, lineHeight: 1, letterSpacing: 0.5 }}>
                                {isReturn ? "RETURN NO" : "ENTRY NO"}
                            </Typography>
                            <Typography sx={{ color: 'white', fontWeight: 800, fontSize: '0.78rem', lineHeight: 1.2 }}>{invoiceNo}</Typography>
                        </Box>
                    </Grid>

                    {headerContent}
                </Grid>
            </Paper>

            {/* Grid Content */}
            {gridContent}

            {/* Footer Content */}
            {footerContent}

            {/* Action Buttons */}
            <Paper elevation={0} sx={{ p: 0.8, mt: 0.5, bgcolor: 'white', borderRadius: 1.2, border: '1px solid #cbd5e1', display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button variant="contained" size="small" startIcon={<ClearIcon />} onClick={onClear} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1.2, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' } }}>
                    Clear
                </Button>
                <Button variant="contained" size="small" startIcon={<SaveIcon />} onClick={onSave} disabled={isSaved || loading} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1.2, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
                    {isEditMode ? 'Update' : 'Save'}
                </Button>
                {isEditMode && (
                    <>
                        <Button variant="contained" size="small" startIcon={<EditIcon />} onClick={onEdit} disabled={!isEditMode || loading} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1.2, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
                            Edit
                        </Button>
                        <Button variant="contained" size="small" startIcon={<DeleteIcon />} onClick={onDelete} disabled={!isEditMode} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1.2, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
                            Delete
                        </Button>
                    </>
                )}
                <Button variant="contained" size="small" startIcon={<SearchIcon />} onClick={onSearch} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1.2, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' } }}>
                    Search
                </Button>
                <Button variant="contained" size="small" startIcon={<PrintIcon />} onClick={onPrint} disabled={!isSaved} sx={{ bgcolor: '#16a34a', color: '#fff', borderRadius: 1.2, textTransform: 'none', fontWeight: 600, px: 1.5, height: 28, fontSize: '0.75rem', boxShadow: 'none', '&:hover': { bgcolor: '#000000' }, '&.Mui-disabled': { bgcolor: '#d1d5db', color: '#9ca3af' } }}>
                    Print
                </Button>

                {onFirst && (
                    <>
                        <Button variant="contained" size="small" onClick={onFirst} sx={{ minWidth: 26, height: 24, borderRadius: 1.2, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}>
                            <FirstIcon sx={{ fontSize: 16 }} />
                        </Button>
                        <Button variant="contained" size="small" onClick={onPrev} sx={{ minWidth: 26, height: 24, borderRadius: 1.2, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}>
                            <PrevIcon sx={{ fontSize: 16 }} />
                        </Button>
                        <Button variant="contained" size="small" onClick={onNext} sx={{ minWidth: 26, height: 24, borderRadius: 1.2, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}>
                            <NextIcon sx={{ fontSize: 16 }} />
                        </Button>
                        <Button variant="contained" size="small" onClick={onLast} sx={{ minWidth: 26, height: 24, borderRadius: 1.2, bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' } }}>
                            <LastIcon sx={{ fontSize: 16 }} />
                        </Button>
                    </>
                )}
            </Paper>
            {children}
        </Box>
    );
};

export default SalesEntryLayout;
