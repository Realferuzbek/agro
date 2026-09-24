'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { brand } from '@/config/brand';

export function BrandMark({ className = '' }: { className?: string }) {
  return <Image className={`brand-mark ${className}`} src={brand.mark} alt="" width={40} height={44} unoptimized />;
}

export function BrandLogo({ animated = false, compact = false }: { animated?: boolean; compact?: boolean }) {
  return <span className={`brand-logo${compact ? ' compact' : ''}`}><span className="brand-logo-symbol">{animated ? <BrandReveal /> : <BrandMark />}</span><span className="brand-wordmark">{brand.name}</span></span>;
}

export function BrandReveal() {
  const [play, setPlay] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const finish = useCallback(() => { setFinishing(true); window.setTimeout(() => setPlay(false), 360); }, []);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || sessionStorage.getItem('baraka-brand-reveal') === 'seen') return;
    sessionStorage.setItem('baraka-brand-reveal', 'seen');
    const start = window.setTimeout(() => setPlay(true), 100);
    return () => window.clearTimeout(start);
  }, []);
  useEffect(() => {
    if (!play) return;
    const fallback = window.setTimeout(finish, 12000);
    return () => window.clearTimeout(fallback);
  }, [play, finish]);
  return <span className="brand-reveal"><BrandMark />{play && <video className={`brand-reveal-video${finishing ? ' finishing' : ''}`} autoPlay muted playsInline preload="none" aria-hidden="true" onEnded={finish} onError={finish}><source src={brand.revealWebm} type="video/webm" /><source src={brand.revealMp4} type="video/mp4" /></video>}</span>;
}
