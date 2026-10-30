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
  inputRef?: React.Ref<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement | HTMLInputElement>;
}

// Helper to get current date in yyyy-mm-dd format
export const getCurrentDate = (): string => {
  return dayjs().format('YYYY-MM-DD');
};

// Helper to format date for display (dd-mm-yyyy e.g. 20-10-2025)
export const formatDateDisplay = (dateVal?: string | Date | null): string => {
  if (!dateVal) return '';
  const d = dayjs(dateVal);
  if (!d.isValid()) {
    const nativeD = new Date(dateVal);
    if (!isNaN(nativeD.getTime())) {
      const day = String(nativeD.getDate()).padStart(2, '0');
      const month = String(nativeD.getMonth() + 1).padStart(2, '0');
      return `${day}-${month}-${nativeD.getFullYear()}`;
    }
    return String(dateVal);
  }
  return d.format('DD-MM-YYYY');
};

// Helper to parse dd-mm-yyyy or dd/mm/yyyy to yyyy-mm-dd
export const parseDateInput = (displayDate: string): string => {
  if (!displayDate) return '';
  const parsed = dayjs(displayDate, ['DD-MM-YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']);
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
  inputRef,
  onKeyDown,
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
        label={label || undefined}
        value={value ? dayjs(value) : null}
        onChange={handleChange}
        format="DD-MM-YYYY"
        disabled={disabled}
        slotProps={{
          textField: {
            inputRef,
            onKeyDown,
            size,
            fullWidth,
            error,
            helperText,
            InputLabelProps: label ? { shrink: true } : undefined,
            sx,
          },
        }}
      />
    </LocalizationProvider>
  );
}
