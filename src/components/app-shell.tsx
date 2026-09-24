'use client';
import { useCopy, useLocale } from '@/config/locale-copy';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, CloudSun, Droplets, History, Info, Leaf, LayoutDashboard, MapPin, Radio, Sprout, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { brand, brandCopy, navigation } from '@/config/brand';
import { localeName, locales, localizedPath, navLabels } from '@/config/i18n';
import { BrandLogo, BrandMark } from './brand-logo';
import { displayLabel } from '@/config/presentation';
import { useFormat } from '@/lib/use-format';
import { useProduct } from './product-provider';
const icons = { today: LayoutDashboard, field: Sprout, irrigation: Droplets, forecast: CloudSun, history: History, devices: Radio };
function Nav({ mobile = false }: { mobile?: boolean }) {const copy = useCopy();
  const pathname = usePathname();
  const locale = useLocale();
  return <nav aria-label={copy.appShell.mainNavigation} className={mobile ? 'mobile-nav' : 'navigation'}>{navigation.map(item => {
    const Icon = icons[item.icon];
    const href = localizedPath(locale, item.href);
    const active = pathname === href || pathname === item.href;
    return <Link key={item.href} href={href} aria-label={navLabels[locale][item.href]} aria-current={active ? 'page' : undefined}><Icon size={19} strokeWidth={1.7} /><span>{navLabels[locale][item.href]}</span>{!mobile && active && <span className="nav-dot" />}</Link>;
  })}</nav>;
}
export function AppShell({ children }: { children: React.ReactNode }) {const { localDate, localTime } = useFormat();const copy = useCopy();
  const locale = useLocale();
  const pathname = usePathname();
  const currentPath = pathname.replace(/^\/(en|uz|ru)(?=\/|$)/, '') || '/';
  const disclosure = brandCopy[locale];
  const { state, error, preview, exitPreview, simulationRunning, speed } = useProduct();
  return <MotionConfig reducedMotion="user"><div className="app-shell">
    <a className="skip-link" href="#main-content">{copy.appShell.skipToContent}</a>
    <aside className="sidebar">
      <Link href={localizedPath(locale)} className="brand" aria-label={brand.name}><BrandLogo animated /></Link>
      <div className="workspace-label">{copy.appShell.yourWorkspace}</div><Nav />
      <div className="sidebar-bottom"><div className="farm-note"><div className="farm-note-leaf"><Leaf size={23} /></div><strong>{copy.appShell.aLittleMoreCare}<br />{copy.appShell.aLittleLessWater}</strong><p>{copy.appShell.betterDecisionsFor}<br />{copy.appShell.everyGrowingDay}</p><div className="note-lines" /></div><div className="farm-identity"><span className="avatar">TF</span><div><strong>{copy.appShell.tashkentDemoFarm}</strong><small>{copy.appShell.tashkentUzbekistan}</small></div></div></div>
    </aside>
    <div className="app-body">
      <header className="topbar"><div className="field-switch"><span className="field-icon"><BrandMark /></span><div><strong>{state ? displayLabel(state.field.name, locale) : copy.appShell.northPotatoField}</strong><span><MapPin size={11} />{copy.appShell.tashkentRegion}<i />{copy.appShell.text10Ha}</span></div><ChevronDown size={15} className="muted" /></div>
        <div className="topbar-right"><nav className="language-switcher" aria-label="Language / Til / Язык">{locales.map(language => <a key={language} href={localizedPath(language, currentPath)} hrefLang={language} lang={language} aria-current={language === locale ? 'true' : undefined} title={localeName[language]}>{language.toUpperCase()}</a>)}</nav><Dialog.Root><Dialog.Trigger className="demo-badge"><span />{disclosure.demoDisclosure}<Info size={13} /></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="small-dialog"><Dialog.Title>{copy.appShell.realCalculationsSimulatedReadings}</Dialog.Title><Dialog.Description>{disclosure.demoExplanation}</Dialog.Description><p className="muted">{disclosure.methodology}</p><Dialog.Close className="button primary">{copy.appShell.understood}</Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root><span className="topbar-avatar" aria-label={copy.appShell.publicFarmView}>TF</span></div>
      </header>
      <AnimatePresence>{preview && <motion.div className="preview-banner" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.2}}><span><strong>{copy.appShell.yourIrrigationPreview}</strong>{copy.appShell.sessionOnly60Speed}</span><button onClick={exitPreview}>{copy.appShell.exitPreview}<X size={14} /></button></motion.div>}</AnimatePresence>
      {simulationRunning && <div className="simulation-banner">{copy.appShell.authoritativeSimulationRunningAt}{speed}× · {state && localTime(state.clock)}{copy.appShell.tashkentTime}</div>}
      {error && state && <div role="status" className="connection-banner">{error}</div>}
      <main id="main-content" className="main-content">{children}</main>
      <footer className="app-footer"><span><Leaf size={12} />{copy.appShell.growingWithIntention}</span><span>{copy.appShell.fao56BasedMethodology}<span className="footer-dot">·</span> {state ? localDate(state.clock, { year: 'numeric' }) : brand.name}</span></footer>
    </div><Nav mobile />
  </div></MotionConfig>;
}
