'use client';
import { useCopy } from '@/config/locale-copy';
export function FieldArt({ dark = false, activeZone = -1 }: { dark?: boolean; activeZone?: number }) {const copy = useCopy();
  return <svg className="field-art" viewBox="0 0 580 330" role="img" aria-label={copy.fieldArt.illustratedOneHectarePotatoFieldDividedIntoFour}>
    <defs><linearGradient id={dark ? 'land-dark' : 'land-light'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={dark ? '#8ba958' : '#b8c989'} /><stop offset="1" stopColor={dark ? '#395f39' : '#63875a'} /></linearGradient><linearGradient id="art-sky" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#e9eedb" stopOpacity=".6" /><stop offset="1" stopColor="#a5b98b" stopOpacity="0" /></linearGradient><filter id="field-shadow"><feGaussianBlur stdDeviation="9" /></filter></defs>
    <ellipse cx="300" cy="279" rx="232" ry="29" fill="#102e22" opacity=".14" filter="url(#field-shadow)" />
    <circle cx="434" cy="72" r="42" fill={dark ? '#d8dc99' : '#f5dc97'} opacity=".6" />
    <path d="M20 142 127 73 201 110 312 31 423 92 520 61 580 118V210H20Z" fill={dark ? '#92a78a' : '#b9c7b0'} opacity=".15" />
    <path d="M25 155 170 108 300 134 435 84 571 156V233H25Z" fill={dark ? '#a8bd83' : '#9db18a'} opacity=".18" />
    <path d="M49 169 279 93 538 172 307 282Z" fill="#846d49" />
    <path d="M49 169V185L307 299V282Z" fill="#80653e" /><path d="M307 282 538 172V189L307 299Z" fill="#5b5336" />
    {[0,1,2,3].map(zone => <g key={zone}>
      <path d={`M${59 + zone * 61} ${169 + zone * 26} L${280 + zone * 60} ${101 + zone * 19} L${331 + zone * 61} ${118 + zone * 18} L${112 + zone * 61} ${192 + zone * 26} Z`} fill={`url(#${dark ? 'land-dark' : 'land-light'})`} stroke={activeZone === zone ? '#a7e8e9' : '#afbe7b'} strokeWidth={activeZone === zone ? 3 : 1} />
      {Array.from({length: 8}, (_, row) => <path key={row} d={`M${65 + zone * 61 + row * 6} ${169 + zone * 26 + row * 2.6} L${283 + zone * 60 + row * 6} ${104 + zone * 19 + row * 1.8}`} stroke={row % 2 ? '#a2b970' : '#c1ce8e'} strokeWidth="3" strokeLinecap="round" opacity=".85" />)}
      <circle cx={185 + zone * 62} cy={155 + zone * 22} r="12" fill={activeZone === zone ? '#d3fbf7' : '#eff5dc'} opacity=".93" /><text x={185 + zone * 62} y={159 + zone * 22} textAnchor="middle" fill="#28523a" fontSize="10" fontFamily="sans-serif" fontWeight="700">{String.fromCharCode(65 + zone)}</text>
    </g>)}
    <path d="M41 197 305 313 551 194" fill="none" stroke={dark ? '#9cb691' : '#a8b89a'} strokeWidth="1" strokeDasharray="3 5" opacity=".65" />
    <text x="153" y="268" fill={dark ? '#bbcfb4' : '#6a7d65'} fontFamily="sans-serif" fontSize="10" transform="rotate(24 153 268)">100 m</text><text x="432" y="268" fill={dark ? '#bbcfb4' : '#6a7d65'} fontFamily="sans-serif" fontSize="10" transform="rotate(-25 432 268)">100 m</text>
    <path d="M514 129V90" stroke="#748861" strokeWidth="4" /><ellipse cx="514" cy="89" rx="16" ry="25" fill="#9aaf70" /><ellipse cx="507" cy="89" rx="9" ry="20" fill="#c0cc8f" />
    <path d="M67 145V116" stroke="#748861" strokeWidth="3" /><ellipse cx="67" cy="108" rx="13" ry="21" fill="#869f64" /><ellipse cx="63" cy="104" rx="8" ry="17" fill="#b2c48c" />
  </svg>;
}
