'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main style={{ margin: '15vh auto', maxWidth: 560, padding: 32 }}><h1>Something interrupted the connection.</h1><p>Your saved field data is safe. Try loading this view again.</p><button onClick={reset}>Try again</button></main>;
}
