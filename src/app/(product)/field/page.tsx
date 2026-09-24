import { FieldView } from '@/components/field-views';
import { pageMetadata } from '@/config/seo';
export const generateMetadata = () => pageMetadata('field');
export default function Page() { return <FieldView />; }
