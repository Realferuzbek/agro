import { IrrigationView } from '@/components/field-views';
import { pageMetadata } from '@/config/seo';
export const generateMetadata = () => pageMetadata('irrigation');
export default function Page() { return <IrrigationView />; }
