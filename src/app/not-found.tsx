import Link from 'next/link';
export default function NotFound() { return <main style={{ margin: '15vh auto', maxWidth: 560, padding: 32 }}><h1>This path doesn’t lead to a field.</h1><p>The page may have moved.</p><Link href="/">Back to Today</Link></main>; }
