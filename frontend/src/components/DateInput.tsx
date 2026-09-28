import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs, { Dayjs } from 'dayjs';

interface DateInputProps {
  label?: string;
  value: string; // ISO format yyyy-mm-dd or empty string
  onChange: (value: string) => void;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  sx?: any;
}

// Helper to get current date in yyyy-mm-dd format
export const getCurrentDate = (): string => {
  return dayjs().format('YYYY-MM-DD');
};

// Helper to format date for display (dd/mm/yyyy)
export const formatDateDisplay = (isoDate: string): string => {
  if (!isoDate) return '';
  return dayjs(isoDate).format('DD/MM/YYYY');
};

// Helper to parse dd/mm/yyyy to yyyy-mm-dd
export const parseDateInput = (displayDate: string): string => {
  if (!displayDate) return '';
  const parsed = dayjs(displayDate, 'DD/MM/YYYY');
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
};

export default function DateInput({
  label = 'Date',
  value,
  onChange,
  size = 'small',
  fullWidth = true,
  disabled = false,
  error = false,
  helperText,
  sx,
}: DateInputProps) {
  const handleChange = (newValue: Dayjs | null) => {
    if (newValue && newValue.isValid()) {
      onChange(newValue.format('YYYY-MM-DD'));
    } else {
      onChange('');
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DatePicker
        label={label}
        value={value ? dayjs(value) : null}
        onChange={handleChange}
        format="DD/MM/YYYY"
        disabled={disabled}
        slotProps={{
          textField: {
            size,
            fullWidth,
            error,
            helperText,
            InputLabelProps: { shrink: true },
            sx,
          },
        }}
      />
    </LocalizationProvider>
  );
}
