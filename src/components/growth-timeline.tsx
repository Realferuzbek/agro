'use client';
import { useCopy } from '@/config/locale-copy';
import { cropStage, POTATO_PARAMETERS } from '@/domain';
export function GrowthTimeline({ stage }: { stage: string }) {const copy = useCopy();
  const labels = ['Initial', 'Development', 'Mid-season', 'Late season'];
  const active = stage === 'Harvest ready' ? 4 : Math.max(0, labels.indexOf(stage));
  return <div className="growth-stages">{labels.map((label, index) => <div key={label} className={`growth-stage ${index < active ? 'done' : index === active ? 'current' : ''}`}><div className="stage-line" /><strong>{copy.growthTimeline.stageNames[index]}</strong><span>{POTATO_PARAMETERS.demoStageDays[index]}{copy.growthTimeline.dayCountSuffix}</span></div>)}</div>;
}

const stageLabels = ['Initial', 'Development', 'Mid-season', 'Late season'];
const coefficientLabels = [
  POTATO_PARAMETERS.kcbInitial.toFixed(2),
  `${POTATO_PARAMETERS.kcbInitial.toFixed(2)} → ${POTATO_PARAMETERS.kcbMid.toFixed(2)}`,
  POTATO_PARAMETERS.kcbMid.toFixed(2),
  `${POTATO_PARAMETERS.kcbMid.toFixed(2)} → ${POTATO_PARAMETERS.kcbEnd.toFixed(2)}`,
];

function coefficientPoints(stageDays: readonly number[]) {
  const boundaries = [0];
  for (const length of stageDays) boundaries.push(boundaries.at(-1)! + length);
  return boundaries.map(day => ({ day, kcb: cropStage(day, stageDays).kcb }));
}

const demoPoints = coefficientPoints(POTATO_PARAMETERS.demoStageDays);
const referencePoints = coefficientPoints(POTATO_PARAMETERS.referenceStageDays);

/** Only chart positioning lives here; coefficient values come from the tested domain stage model. */
export function CropCoefficientProgression({ daysAfterPlanting, currentKcb }: { daysAfterPlanting: number; currentKcb: number }) {const copy = useCopy();
  const x = (day: number) => 44 + Math.min(130, Math.max(0, day)) / 130 * 512;
  const y = (coefficient: number) => 162 - coefficient / Math.max(1.25, currentKcb) * 132;
  const path = (points: typeof demoPoints) => points.map((point, index) => `${index ? 'L' : 'M'} ${x(point.day)} ${y(point.kcb)}`).join(' ');
  return <div>
    <svg viewBox="0 0 580 206" role="img" aria-label={copy.growthTimeline.potatoBasalCoefficientProgressionThe90DaySimulated(POTATO_PARAMETERS.kcbInitial, POTATO_PARAMETERS.kcbMid, POTATO_PARAMETERS.kcbEnd, daysAfterPlanting, currentKcb.toFixed(2))} style={{ display: 'block', width: '100%', maxHeight: 240 }}>
      {[0, .5, 1].map(value => <g key={value}><line x1={44} x2={556} y1={y(value)} y2={y(value)} stroke="#e6eadf" strokeDasharray="3 4" /><text x={32} y={y(value) + 4} textAnchor="end" fill="#66755e" fontSize={12}>{value.toFixed(1)}</text></g>)}
      {[0, 20, 40, 70, 90, 130].map(day => <text key={day} x={x(day)} y={183} textAnchor="middle" fill="#66755e" fontSize={12}>{day}</text>)}
      <text x={44} y={17} fill="#496442" fontSize={12}>{copy.growthTimeline.basalCropCoefficientKcb}</text>
      <text x={300} y={202} textAnchor="middle" fill="#66755e" fontSize={12}>{copy.growthTimeline.daysAfterPlanting}</text>
      <path d={path(referencePoints)} fill="none" stroke="#ac8d4d" strokeWidth={2} strokeDasharray="6 5" />
      <path d={path(demoPoints)} fill="none" stroke="#537c46" strokeWidth={3} />
      {demoPoints.map(point => <circle key={point.day} cx={x(point.day)} cy={y(point.kcb)} r={3} fill="#537c46" />)}
      <line x1={x(daysAfterPlanting)} x2={x(daysAfterPlanting)} y1={27} y2={162} stroke="#537c46" strokeDasharray="2 4" opacity={.5} />
      <circle cx={x(daysAfterPlanting)} cy={y(currentKcb)} r={5} fill="#fffefa" stroke="#305b32" strokeWidth={2}><title>{`${copy.growthTimeline.todayDay}${daysAfterPlanting}${copy.growthTimeline.kcb}${currentKcb.toFixed(2)}`}</title></circle>
    </svg>
    <div className="chart-caption"><span className="chart-key"><i />{copy.growthTimeline.text90DayDemoAssumption}</span><span className="chart-key"><i className="amber" />{copy.growthTimeline.text130DayReferenceExampleDashed}</span></div>
    <details style={{ marginTop: 16 }}><summary style={{ cursor: 'pointer', color: '#496442', fontSize: 12 }}>{copy.growthTimeline.compareTheFourGrowthStages}</summary><div className="table-wrap" tabIndex={0} style={{ marginTop: 8 }}><table><thead><tr><th>{copy.growthTimeline.stage}</th><th>{copy.growthTimeline.demoDays}</th><th>{copy.growthTimeline.referenceDays}</th><th>{copy.growthTimeline.kcbProgression}</th></tr></thead><tbody>{stageLabels.map((label, index) => <tr key={label}><td>{copy.growthTimeline.stageNames[index]}</td><td>{POTATO_PARAMETERS.demoStageDays[index]}</td><td>{POTATO_PARAMETERS.referenceStageDays[index]}</td><td>{coefficientLabels[index]}</td></tr>)}</tbody></table></div></details>
    <p className="fine-print">{copy.growthTimeline.coefficientsAreReferenceInputsTheConfigured90Day}</p>
  </div>;
}
