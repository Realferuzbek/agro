'use client';
import { useCopy } from '@/config/locale-copy';
export default function ErrorPage({ reset }: { reset: () => void }) {const copy = useCopy();
  return <main style={{ margin: '15vh auto', maxWidth: 560, padding: 32 }}><h1>{copy.system.interruptedTitle}</h1><p>{copy.system.interruptedDescription}</p><button onClick={reset}>{copy.system.retry}</button></main>;
}
