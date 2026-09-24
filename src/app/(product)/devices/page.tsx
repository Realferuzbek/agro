import { DevicesView } from '@/components/field-views';
import { pageMetadata } from '@/config/seo';
export const generateMetadata = () => pageMetadata('devices');
export default function Page() { return <DevicesView />; }
