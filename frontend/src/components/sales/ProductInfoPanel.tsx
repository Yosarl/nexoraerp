import React from 'react';
import { Paper, Box, Typography, Divider, Grid } from '@mui/material';

interface ProductInfoPanelProps {
    productInfo: {
        profit?: number;
        purchaseRate: number;
        retailPrice: number;
        wholesalePrice: number;
        specialPrice1?: number;
        specialPrice2?: number;
        stock?: number;
        totalStock?: number;
        lastVendor?: string;
        batchNumber?: string;
        expiryDate?: string;
    } | null;
    activeMultiUnit?: {
        name: string;
        pcsInside?: number;
        multiUnitPrice?: number;
        wholesale?: number;
        retail?: number;
        specialPrice1?: number;
        specialPrice2?: number;
    } | null;
}

const ProductInfoPanel: React.FC<ProductInfoPanelProps> = ({ productInfo, activeMultiUnit }) => {
    if (!productInfo) {
        return (
            <Paper elevation={0} sx={{ p: 2, borderRadius: 2, bgcolor: 'white', border: '1px solid #e0e7ef', height: '100%' }}>
                <Typography variant="subtitle2" sx={{ color: '#64748b', textAlign: 'center', mt: 4 }}>
                    Select a product to view details
                </Typography>
            </Paper>
        );
    }

    const DataRow = ({ label, value, color }: { label: string; value: string | number | undefined; color?: string }) => (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="caption" fontWeight={600} sx={{ color }}>{value ?? '-'}</Typography>
        </Box>
    );

    return (
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2, bgcolor: 'white', border: '1px solid #e0e7ef', height: '100%', overflowY: 'auto' }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, color: '#1e293b' }}>Product Information</Typography>

            <Box sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 1.5, mb: 2 }}>
                <DataRow label="Purchase Rate" value={productInfo.purchaseRate.toFixed(2)} />
                <DataRow label="Profit" value={productInfo.profit?.toFixed(2)} color={productInfo.profit && productInfo.profit > 0 ? '#10b981' : '#f43f5e'} />
            </Box>

            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>PRICE LIST</Typography>
            <DataRow label="Retail Price" value={productInfo.retailPrice.toFixed(2)} />
            <DataRow label="Wholesale" value={productInfo.wholesalePrice.toFixed(2)} />
            {productInfo.specialPrice1 !== undefined && <DataRow label="Special 1" value={productInfo.specialPrice1.toFixed(2)} />}
            {productInfo.specialPrice2 !== undefined && <DataRow label="Special 2" value={productInfo.specialPrice2.toFixed(2)} />}

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>STOCK DETAILS</Typography>
            <DataRow label="Current Batch Stock" value={productInfo.stock} color="#0f766e" />
            <DataRow label="Total Available Stock" value={productInfo.totalStock} color="#0f766e" />

            <Divider sx={{ my: 1.5 }} />

            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>BATCH INFO</Typography>
            <DataRow label="Batch No" value={productInfo.batchNumber} />
            <DataRow label="Expiry" value={productInfo.expiryDate} />
            <DataRow label="Last Vendor" value={productInfo.lastVendor} />

            {activeMultiUnit && (
                <>
                    <Divider sx={{ my: 1.5 }} />
                    <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>MULTI-UNIT ({activeMultiUnit.name})</Typography>
                    <DataRow label="Pcs Inside" value={activeMultiUnit.pcsInside} />
                    <DataRow label="Unit Price" value={activeMultiUnit.multiUnitPrice?.toFixed(2)} />
                </>
            )}
        </Paper>
    );
};

export default ProductInfoPanel;
