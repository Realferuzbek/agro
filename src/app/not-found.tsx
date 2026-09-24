'use client';
import Link from 'next/link';
import { useCopy } from '@/config/locale-copy';
export default function NotFound() {const copy = useCopy(); return <main style={{ margin: '15vh auto', maxWidth: 560, padding: 32 }}><h1>{copy.system.notFoundTitle}</h1><p>{copy.system.notFoundDescription}</p><Link href="/">{copy.system.backToToday}</Link></main>; }
