import React from 'react';
import { useSalesEntry } from '../../hooks/useSalesEntry';
import SalesEntryLayout from './SalesEntryLayout';
import SalesGrid from './SalesGrid';
import SalesSummary from './SalesSummary';
import { Grid, TextField, Autocomplete, RadioGroup, FormControlLabel, Radio, Box, Typography } from '@mui/material';
import DateInput from '../DateInput';

interface BaseSalesPageProps {
  type: 'b2c' | 'return' | 'quotation';
  title: string;
  api: any;
  holdStorageKey: string;
}

const BaseSalesPage: React.FC<BaseSalesPageProps> = ({ type, title, api, holdStorageKey }) => {
  const sales = useSalesEntry({
    entryType: type,
    api,
    holdStorageKey,
  });

  const { state, helpers, navigation } = sales;

  const headerContent = (
    <>
      <Grid item xs={6} sm={3} md={2} lg={1.7}>
        <DateInput label="Date" value={state.date} onChange={state.setDate} size="small" />
      </Grid>
      <Grid item xs={12} sm={4}>
        <Autocomplete
          size="small"
          options={state.customers}
          getOptionLabel={(opt) => opt.name || ''}
          value={state.customers.find((c) => c._id === state.customerId) || state.customers[0] || null}
          onChange={(_, v) => {
            if (v) {
              state.setCustomerId(v._id === 'cash' ? null : v._id);
              state.setCustomerName(v.name);
            }
          }}
          renderInput={(params) => <TextField {...params} label="Customer" InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }} />}
        />
      </Grid>
      {type === 'return' && (
        <Grid item xs={12} sm={4}>
          <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, px: 1.2, py: 0.5, bgcolor: '#f8fafc' }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', letterSpacing: 0.3, mb: 0.2 }}>RETURN TYPE</Typography>
            <RadioGroup row value={state.returnType || 'OnAccount'} onChange={(e) => state.setReturnType(e.target.value as any)}>
              <FormControlLabel value="OnAccount" control={<Radio size="small" />} label="On Account" />
              <FormControlLabel value="ByRef" control={<Radio size="small" />} label="By Ref" />
            </RadioGroup>
          </Box>
        </Grid>
      )}
    </>
  );

  return (
    <SalesEntryLayout
      title={title}
      invoiceNo={state.invoiceNo}
      isSaved={state.isSaved}
      isEditMode={!!state.invoiceId}
      loading={state.loading}
      isReturn={type === 'return'}
      headerContent={headerContent}
      onFirst={navigation.handleFirst}
      onPrev={navigation.handlePrev}
      onNext={navigation.handleNext}
      onLast={navigation.handleLast}
      onClear={helpers.handleClear}
      gridContent={
        <SalesGrid
          lines={state.lines}
          products={state.products}
          onUpdateLine={helpers.updateLine}
          onRemoveLine={helpers.removeLine}
          onProductSelect={helpers.handleProductSelect}
          onUnitChange={() => { }} // Implementation pending mapped to base hook later if needed
          activeLineId={state.activeLineId}
          setActiveLineId={state.setActiveLineId}
        />
      }
      footerContent={
        <SalesSummary
          grossAmount={helpers.updateGrandTotals.itemsGross}
          totalVat={helpers.updateGrandTotals.itemsVat}
          grandTotal={helpers.updateGrandTotals.grandTotal}
          otherDiscount={state.otherDiscount}
          setOtherDiscount={state.setOtherDiscount}
          otherDiscPercent={state.otherDiscPercent}
          setOtherDiscPercent={state.setOtherDiscPercent}
          otherCharges={state.otherCharges}
          setOtherCharges={state.setOtherCharges}
          freightCharge={state.freightCharge}
          setFreightCharge={state.setFreightCharge}
          roundOff={state.roundOff}
          setRoundOff={state.setRoundOff}
          narration={state.narration}
          setNarration={state.setNarration}
        />
      }
    />
  );
};

export default BaseSalesPage;
