import { HistoryView } from '@/components/field-views';
import { pageMetadata } from '@/config/seo';
export const generateMetadata = () => pageMetadata('history');
export default function Page() { return <HistoryView />; }
