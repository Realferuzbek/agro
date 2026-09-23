'use client';
import { copy } from '@/config/copy';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, CloudSun, Droplets, History, Info, Leaf, LayoutDashboard, MapPin, Radio, Sprout, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { brand, navigation } from '@/config/brand';
import { localDate, localTime } from '@/lib/format';
import { useProduct } from './product-provider';
const icons = { today: LayoutDashboard, field: Sprout, irrigation: Droplets, forecast: CloudSun, history: History, devices: Radio };
function Nav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  return <nav aria-label={copy.appShell.mainNavigation} className={mobile ? 'mobile-nav' : 'navigation'}>{navigation.map(item => {
    const Icon = icons[item.icon];
    return <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}><Icon size={19} strokeWidth={1.7} /><span>{item.label}</span>{!mobile && pathname === item.href && <span className="nav-dot" />}</Link>;
  })}</nav>;
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const { state, error, preview, exitPreview, simulationRunning, speed } = useProduct();
  return <MotionConfig reducedMotion="user"><div className="app-shell">
    <a className="skip-link" href="#main-content">{copy.appShell.skipToContent}</a>
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-icon"><Sprout size={25} /></span>{brand.name}<span className="brand-period">.</span></Link>
      <div className="workspace-label">{copy.appShell.yourWorkspace}</div><Nav />
      <div className="sidebar-bottom"><div className="farm-note"><div className="farm-note-leaf"><Leaf size={23} /></div><strong>{copy.appShell.aLittleMoreCare}<br />{copy.appShell.aLittleLessWater}</strong><p>{copy.appShell.betterDecisionsFor}<br />{copy.appShell.everyGrowingDay}</p><div className="note-lines" /></div><div className="farm-identity"><span className="avatar">TF</span><div><strong>{copy.appShell.tashkentDemoFarm}</strong><small>{copy.appShell.tashkentUzbekistan}</small></div></div></div>
    </aside>
    <div className="app-body">
      <header className="topbar"><div className="field-switch"><span className="field-icon"><Sprout size={20} /></span><div><strong>{state?.field.name ?? copy.appShell.northPotatoField}</strong><span><MapPin size={11} />{copy.appShell.tashkentRegion}<i />{copy.appShell.text10Ha}</span></div><ChevronDown size={15} className="muted" /></div>
        <div className="topbar-right"><Dialog.Root><Dialog.Trigger className="demo-badge"><span />{brand.demoDisclosure}<Info size={13} /></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="small-dialog"><Dialog.Title>{copy.appShell.realCalculationsSimulatedReadings}</Dialog.Title><Dialog.Description>{brand.demoExplanation}</Dialog.Description><p className="muted">{brand.methodology}</p><Dialog.Close className="button primary">{copy.appShell.understood}</Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root><span className="topbar-avatar" aria-label={copy.appShell.publicFarmView}>TF</span></div>
      </header>
      <AnimatePresence>{preview && <motion.div className="preview-banner" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.2}}><span><strong>{copy.appShell.yourIrrigationPreview}</strong>{copy.appShell.sessionOnly60Speed}</span><button onClick={exitPreview}>{copy.appShell.exitPreview}<X size={14} /></button></motion.div>}</AnimatePresence>
      {simulationRunning && <div className="simulation-banner">{copy.appShell.authoritativeSimulationRunningAt}{speed}× · {state && localTime(state.clock)}{copy.appShell.tashkentTime}</div>}
      {error && state && <div role="status" className="connection-banner">{error}</div>}
      <main id="main-content" className="main-content">{children}</main>
      <footer className="app-footer"><span><Leaf size={12} />{copy.appShell.growingWithIntention}</span><span>{copy.appShell.fao56BasedMethodology}<span className="footer-dot">·</span> {state ? localDate(state.clock, { year: 'numeric' }) : 'AgriFlow'}</span></footer>
    </div><Nav mobile />
  </div></MotionConfig>;
}
