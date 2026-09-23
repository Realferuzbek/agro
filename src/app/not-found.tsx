import Link from 'next/link';
import { copy } from '@/config/copy';
export default function NotFound() { return <main style={{ margin: '15vh auto', maxWidth: 560, padding: 32 }}><h1>{copy.system.notFoundTitle}</h1><p>{copy.system.notFoundDescription}</p><Link href="/">{copy.system.backToToday}</Link></main>; }
