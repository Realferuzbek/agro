import { POTATO_PARAMETERS } from '@/domain';
export function GrowthTimeline({ stage }: { stage: string }) {
  const labels = ['Initial', 'Development', 'Mid-season', 'Late season'];
  const active = stage === 'Harvest ready' ? 4 : Math.max(0, labels.indexOf(stage));
  return <div className="growth-stages">{labels.map((label, index) => <div key={label} className={`growth-stage ${index < active ? 'done' : index === active ? 'current' : ''}`}><div className="stage-line" /><strong>{label}</strong><span>{POTATO_PARAMETERS.demoStageDays[index]} days</span></div>)}</div>;
}
