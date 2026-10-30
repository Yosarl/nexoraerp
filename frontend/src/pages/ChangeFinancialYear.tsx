import { useEffect, useState } from 'react';
import { Box, Typography, List, ListItem, ListItemButton, ListItemText, Paper, Alert } from '@mui/material';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { setFinancialYear } from '../store/slices/appSlice';
import { financialYearApi } from '../services/api';
import { formatDateDisplay } from '../components/DateInput';

interface FY {
  _id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: string;
}

export default function ChangeFinancialYear() {
  const [years, setYears] = useState<FY[]>([]);
  const [message, setMessage] = useState('');
  const companyId = useAppSelector((s) => s.app.selectedCompanyId);
  const selectedFYId = useAppSelector((s) => s.app.selectedFinancialYearId);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!companyId) return;
    financialYearApi.list(companyId).then((res) => setYears((res.data.data as FY[]) ?? []));
  }, [companyId]);

  const selectFY = async (fyId: string) => {
    if (!companyId) return;
    try {
      await financialYearApi.setCurrent(companyId, fyId);
      dispatch(setFinancialYear(fyId));
      setMessage('Financial year updated.');
    } catch {
      setMessage('Failed to set financial year.');
    }
  };

  if (!companyId) return <Typography color="error">Select a company first (File → Companies).</Typography>;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Change Financial Year</Typography>
      {message && <Alert severity="info" onClose={() => setMessage('')} sx={{ mb: 2 }}>{message}</Alert>}
      <Typography color="text.secondary" sx={{ mb: 2 }}>Select the active financial year. All reports and entries will respect this year.</Typography>
      <Paper sx={{ p: 2, maxWidth: 500 }}>
        <List>
          {years.map((fy) => (
            <ListItem key={fy._id} disablePadding>
              <ListItemButton selected={selectedFYId === fy._id} onClick={() => selectFY(fy._id)}>
                <ListItemText
                  primary={fy.name}
                  secondary={`${formatDateDisplay(fy.startDate)} - ${formatDateDisplay(fy.endDate)} ${fy.isCurrent ? '(Current)' : ''}`}
                />
                {selectedFYId === fy._id && <Typography variant="caption" color="primary">Selected</Typography>}
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Paper>
    </Box>
  );
}
