'use client';
import { copy } from '@/config/copy';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main style={{ margin: '15vh auto', maxWidth: 560, padding: 32 }}><h1>{copy.system.interruptedTitle}</h1><p>{copy.system.interruptedDescription}</p><button onClick={reset}>{copy.system.retry}</button></main>;
}
