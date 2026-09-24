import { Today } from '@/components/today';
import { pageMetadata } from '@/config/seo';
export const generateMetadata = () => pageMetadata('today');
export default function Page() { return <Today />; }
