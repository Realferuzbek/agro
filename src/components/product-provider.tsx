'use client';
import { useCopy } from '@/config/locale-copy';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { brand } from '@/config/brand';
import { advanceSimulation, applySimulationCommand, type SimulationState } from '@/domain';

type Snapshot = { state: SimulationState | null; error: string | null; revision?: number };
type Session = { isAdmin: boolean; user: { id?:string; email?: string } | null; role:string|null; permissions:string[]; canManageAdmins:boolean };
const anonymousSession:Session={isAdmin:false,user:null,role:null,permissions:[],canManageAdmins:false};
const previewStorageKey = `${brand.slug}-preview`;
type Command = 'start' | 'pause' | 'resume' | 'stop';
type ProductContextType = Snapshot & {
  preview: boolean; session: Session; simulationRunning: boolean; speed: number;
  refresh: () => Promise<void>; refreshSession: () => Promise<void>;
  beginPreview: () => void; exitPreview: () => void; command: (command: Command) => void;
  adminAction: (action: string, data?: Record<string, unknown>) => Promise<void>;
  setSimulationRunning: (running: boolean) => void; setSpeed: (speed: number) => void;
};
const ProductContext = createContext<ProductContextType | null>(null);
export function useProduct() { const context = useContext(ProductContext); if (!context) throw new Error('ProductProvider is required'); return context; }

export function ProductProvider({ initial, children }: { initial: Snapshot; children: React.ReactNode }) {const copy = useCopy();
  const [snapshot, setSnapshot] = useState(initial);
  const [previewState, setPreviewState] = useState<SimulationState | null>(null);
  const [session, setSession] = useState<Session>(anonymousSession);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [speed, setSpeed] = useState(60);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    try { const response = await fetch('/api/product', { cache: 'no-store' }); const result = await response.json(); setSnapshot(previous => result.state && (result.revision ?? 0) < (previous.revision ?? 0) ? previous : { state: result.state ?? null, error: result.error ?? null, revision: result.revision }); }
    catch { setSnapshot(previous => ({ ...previous, error: copy.productProvider.theFieldConnectionIsUnavailableReconnecting })); }
  }, [copy.productProvider.theFieldConnectionIsUnavailableReconnecting]);
  const refreshSession = useCallback(async () => {
    try { const response = await fetch('/api/auth/session', { cache: 'no-store' }); const result = await response.json(); setSession({ isAdmin: result.isAdmin === true, user: result.user ?? null,role:result.role??null,permissions:result.permissions??[],canManageAdmins:result.canManageAdmins===true }); }
    catch { setSession(anonymousSession); }
  }, []);
  useEffect(() => { void refreshSession(); }, [refreshSession]);
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    const client = createBrowserSupabaseClient();
    if (!client) return;
    const channel = client.channel(`${brand.slug}-field`).on('postgres_changes', { event: '*', schema: 'public', table: 'product_state' }, () => void refresh()).subscribe();
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => { void client.removeChannel(channel); clearInterval(interval); };
  }, [refresh]);
  useEffect(() => {
    Promise.resolve().then(() => {
      try { const stored = sessionStorage.getItem(previewStorageKey); if (stored) { const parsed = JSON.parse(stored); if (parsed.schemaVersion === 1) setPreviewState(parsed); } } catch { sessionStorage.removeItem(previewStorageKey); }
    });
  }, []);
  useEffect(() => {
    if (previewState) sessionStorage.setItem(previewStorageKey, JSON.stringify(previewState));
  }, [previewState]);
  // Pausing irrigation stops delivery, not rain, device updates, or the scenario clock.
  const previewRunning = !!previewState && previewState.status !== 'stopped' && previewState.status !== 'completed';
  useEffect(() => {
    if (!previewRunning) return;
    const interval = window.setInterval(() => setPreviewState(previous => previous ? advanceSimulation(previous, 60) : null), 1000);
    return () => clearInterval(interval);
  }, [previewRunning]);

  const adminAction = useCallback(async (action: string, data: Record<string, unknown> = {}) => {
    const response = await fetch('/api/admin/simulation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, expectedVersion: snapshot.revision ?? snapshot.state?.version, idempotencyKey: crypto.randomUUID(), ...data }) });
    const result = await response.json();
    if (!response.ok) { if (response.status === 409) await refresh(); throw new Error(result.error ?? copy.productProvider.theActionCouldNotBeCompleted); }
    if (result.state) setSnapshot({ state: result.state, revision: result.revision, error: null }); else await refresh();
  }, [snapshot.revision, snapshot.state?.version, refresh, copy.productProvider.theActionCouldNotBeCompleted]);
  useEffect(() => {
    if (!session.isAdmin || !session.permissions.includes('simulation.manage') || !simulationRunning) return;
    const interval = window.setInterval(async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try { await adminAction('advance', { minutes: speed / 60 }); }
      catch (error) { setSimulationRunning(false); setSnapshot(previous => ({ ...previous, error: error instanceof Error ? error.message : copy.productProvider.simulationPaused })); }
      finally { inFlight.current = false; }
    }, 1000);
    return () => clearInterval(interval);
  }, [session.isAdmin, session.permissions, simulationRunning, speed, adminAction, copy.productProvider.simulationPaused]);

  const beginPreview = () => { if (snapshot.state) setPreviewState(applySimulationCommand(structuredClone(snapshot.state), 'start')); };
  const command = (value: Command) => setPreviewState(previous => previous ? applySimulationCommand(previous, value) : previous);
  return <ProductContext.Provider value={{ ...snapshot, state: previewState ?? snapshot.state, preview: !!previewState, session, simulationRunning, speed, refresh, refreshSession, beginPreview, exitPreview: () => { sessionStorage.removeItem(previewStorageKey); setPreviewState(null); }, command, adminAction, setSimulationRunning, setSpeed }}>{children}</ProductContext.Provider>;
}
