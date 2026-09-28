import { useSearchParams } from 'react-router-dom';
import LedgerRegForm from '../components/LedgerRegForm';

export default function LedgerAccountCreate() {
  const [searchParams] = useSearchParams();
  const defaultType = searchParams.get('type') || '';
  const type =
    defaultType === 'Customer'
      ? 'Customer'
      : defaultType === 'Supplier'
        ? 'Supplier'
        : null;

  return <LedgerRegForm ledgerType={type} />;
}
