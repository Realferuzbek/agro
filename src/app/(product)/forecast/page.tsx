import { ForecastView } from '@/components/field-views';
import { pageMetadata } from '@/config/seo';
export const generateMetadata = () => pageMetadata('forecast');
export default function Page() { return <ForecastView />; }
