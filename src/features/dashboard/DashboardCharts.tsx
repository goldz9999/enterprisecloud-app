import { useRef, useState } from 'react';
import { fmtDayMonth } from '@/shared/lib/dates';
import './DashboardCharts.css';

export interface DailySale { date: string; total: number; count: number }
export interface CategorySale { category: string; total: number; units: number }

const S = (n: number) => 'S/ ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const S0 = (n: number) => 'S/ ' + Math.round(n).toLocaleString('en-US');
const short = (n: number) => (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + 'k' : String(Math.round(n)));

/** 'YYYY-MM-DD' -> fecha local (sin desfase de zona horaria). */
const parseDay = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
};

/** Máximo "redondo" para el eje Y. */
function niceMax(v: number) {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / pow;
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * pow;
}

/* ------------------------------------------------------------------ Línea: ventas diarias */
const LW = 640;
const LH = 230;
const PAD = { l: 46, r: 14, t: 12, b: 26 };

export function DailySalesChart({ data, rangeLabel }: { data: DailySale[]; rangeLabel: string }) {
    const [hover, setHover] = useState<number | null>(null);
    const wrap = useRef<HTMLDivElement>(null);
    const total = data.reduce((a, d) => a + d.total, 0);
    const hasSales = total > 0;

    const iw = LW - PAD.l - PAD.r;
    const ih = LH - PAD.t - PAD.b;
    const max = niceMax(Math.max(...data.map(d => d.total), 0));
    const x = (i: number) => PAD.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const y = (v: number) => PAD.t + ih - (v / max) * ih;

    const pts = data.map((d, i) => [x(i), y(d.total)] as const);
    const line = pts.map(([px, py], i) => (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1)).join(' ');
    const area = pts.length ? `${line} L${pts[pts.length - 1][0].toFixed(1)} ${PAD.t + ih} L${pts[0][0].toFixed(1)} ${PAD.t + ih} Z` : '';

    const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => f * max);
    const labelCount = Math.min(data.length, 7);
    const labelIdx = new Set(Array.from({ length: labelCount }, (_, k) => (labelCount <= 1 ? 0 : Math.round((k * (data.length - 1)) / (labelCount - 1)))));
    const showDots = data.length <= 31;

    const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * LW;
        const i = Math.round(((px - PAD.l) / iw) * (data.length - 1));
        setHover(Math.max(0, Math.min(data.length - 1, i)));
    };

    const tip = hover !== null && data[hover] ? data[hover] : null;
    const tipLeft = hover !== null ? (x(hover) / LW) * 100 : 0;
    const tipTop = hover !== null && tip ? (y(tip.total) / LH) * 100 : 0;

    return (
        <div className="panel">
            <div className="panel__head" style={{ padding: '12px 16px' }}>
                <div className="panel__title">Ventas diarias</div>
                <div className="chart-head__meta">{rangeLabel} · <strong>{S0(total)}</strong></div>
            </div>
            <div className="chart-body" ref={wrap}>
                {!hasSales ? (
                    <div className="chart-empty">Aún no hay ventas facturadas en este periodo.</div>
                ) : (
                    <>
                        <svg className="line-chart" viewBox={`0 0 ${LW} ${LH}`} role="img" aria-label={`Ventas diarias, ${rangeLabel}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
                            <defs>
                                <linearGradient id="dash-line-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--accent)" stopOpacity=".28" />
                                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            {ticks.map(t => (
                                <g key={t}>
                                    <line className="line-chart__grid" x1={PAD.l} x2={LW - PAD.r} y1={y(t)} y2={y(t)} />
                                    <text className="line-chart__axis" x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{short(t)}</text>
                                </g>
                            ))}
                            <path d={area} fill="url(#dash-line-fill)" />
                            <path className="line-chart__line" d={line} />
                            {data.map((d, i) => labelIdx.has(i) && (
                                <text key={d.date} className="line-chart__axis" x={x(i)} y={LH - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>
                                    {fmtDayMonth(parseDay(d.date))}
                                </text>
                            ))}
                            {showDots && pts.map(([px, py], i) => <circle key={i} className="line-chart__dot" cx={px} cy={py} r={3} />)}
                            {hover !== null && (
                                <>
                                    <line className="line-chart__cursor" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + ih} />
                                    <circle className="line-chart__dot" cx={x(hover)} cy={y(data[hover].total)} r={5} />
                                </>
                            )}
                        </svg>
                        {tip && (
                            <div className="chart-tip" style={{ left: `calc(16px + (100% - 32px) * ${tipLeft / 100})`, top: `calc(14px + (100% - 26px) * ${tipTop / 100} - 8px)` }}>
                                <div className="chart-tip__label">{fmtDayMonth(parseDay(tip.date))} · {tip.count} {tip.count === 1 ? 'venta' : 'ventas'}</div>
                                <div className="chart-tip__value">{S(tip.total)}</div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ Pastel 3D: ventas por categoría */
const COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];
const MAX_SLICES = 7;
// Disco inclinado: elipse de radios RX × RY y un canto de DEPTH unidades.
const CX = 120;
const CY = 62;
const RX = 112;
const RY = 58;
const DEPTH = 22;
const TAU = Math.PI * 2;
const START = -Math.PI / 2; // la primera porción empieza arriba (atrás del disco) y avanza en sentido horario

const pt = (a: number, dy = 0) => `${(CX + RX * Math.cos(a)).toFixed(2)} ${(CY + RY * Math.sin(a) + dy).toFixed(2)}`;

/** Oscurece un color hex (para el canto de cada porción). */
function shade(hex: string, f: number) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v: number) => Math.round(v * f).toString(16).padStart(2, '0');
    return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

export function CategorySalesChart({ data, rangeLabel }: { data: CategorySale[]; rangeLabel: string }) {
    const [hover, setHover] = useState<number | null>(null);

    // Las categorías pequeñas se agrupan en "Otras" para que el pastel siga siendo legible.
    const sorted = [...data].filter(c => c.total > 0).sort((a, b) => b.total - a.total);
    const head = sorted.slice(0, MAX_SLICES);
    const rest = sorted.slice(MAX_SLICES);
    const slices = rest.length ? [...head, { category: 'Otras', total: rest.reduce((a, c) => a + c.total, 0), units: rest.reduce((a, c) => a + c.units, 0) }] : head;
    const total = slices.reduce((a, c) => a + c.total, 0);
    const single = slices.length === 1;

    let acc = 0;
    const arcs = slices.map((c, i) => {
        const frac = c.total / total;
        const a0 = START + acc * TAU;
        acc += frac;
        const a1 = START + acc * TAU;
        const color = COLORS[i % COLORS.length];
        const top = single
            ? `M${CX - RX} ${CY} A${RX} ${RY} 0 1 1 ${CX + RX} ${CY} A${RX} ${RY} 0 1 1 ${CX - RX} ${CY} Z`
            : `M${CX} ${CY} L${pt(a0)} A${RX} ${RY} 0 ${frac > 0.5 ? 1 : 0} 1 ${pt(a1)} Z`;
        // Canto: solo se ve la mitad delantera del disco (ángulos 0…π). Cada porción pinta su tramo visible.
        const s0 = Math.max(a0, 0);
        const s1 = Math.min(a1, Math.PI);
        const side = s1 > s0 ? `M${pt(s0)} A${RX} ${RY} 0 0 1 ${pt(s1)} L${pt(s1, DEPTH)} A${RX} ${RY} 0 0 0 ${pt(s0, DEPTH)} Z` : '';
        const mid = (a0 + a1) / 2;
        const lx = single ? CX : CX + RX * 0.6 * Math.cos(mid);
        const ly = single ? CY : CY + RY * 0.6 * Math.sin(mid);
        return { ...c, i, frac, top, side, lx, ly, color, sideColor: shade(color, 0.68) };
    });
    const cls = (i: number) => 'pie3d__slice' + (hover === i ? ' is-hover' : '');
    const on = (i: number) => ({ onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null) });

    return (
        <div className="panel">
            <div className="panel__head" style={{ padding: '12px 16px' }}>
                <div className="panel__title">Ventas por categoría</div>
                <div className="chart-head__meta">{rangeLabel}</div>
            </div>
            <div className="chart-body">
                {total <= 0 ? (
                    <div className="chart-empty">Aún no hay ventas facturadas en este periodo.</div>
                ) : (
                    <div className="pie-wrap">
                        <svg className={'pie3d' + (hover !== null ? ' has-hover' : '')} viewBox={`0 0 ${CX * 2} ${CY * 2 + DEPTH + 4}`} role="img" aria-label={`Ventas por categoría, ${rangeLabel}`}>
                            <defs>
                                {/* Sombra del canto: más oscuro hacia los lados, como un cilindro */}
                                <linearGradient id="pie3d-wall" x1="0" x2="1" y1="0" y2="0">
                                    <stop offset="0" stopColor="#000" stopOpacity=".35" />
                                    <stop offset=".35" stopColor="#000" stopOpacity="0" />
                                    <stop offset=".65" stopColor="#000" stopOpacity="0" />
                                    <stop offset="1" stopColor="#000" stopOpacity=".35" />
                                </linearGradient>
                                {/* Brillo suave sobre la cara superior */}
                                <radialGradient id="pie3d-gloss" cx=".45" cy=".3" r=".75">
                                    <stop offset="0" stopColor="#fff" stopOpacity=".22" />
                                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                                </radialGradient>
                            </defs>
                            <ellipse className="pie3d__shadow" cx={CX} cy={CY + DEPTH + 2} rx={RX * 0.96} ry={RY * 0.9} />
                            {arcs.map(a => a.side && (
                                <path key={'s' + a.category} d={a.side} fill={a.sideColor} className={cls(a.i)} {...on(a.i)} />
                            ))}
                            <path className="pie3d__fx" d={`M${pt(0)} A${RX} ${RY} 0 0 1 ${pt(Math.PI)} L${pt(Math.PI, DEPTH)} A${RX} ${RY} 0 0 0 ${pt(0, DEPTH)} Z`} fill="url(#pie3d-wall)" />
                            {arcs.map(a => (
                                <path key={a.category} d={a.top} fill={a.color} className={cls(a.i)} {...on(a.i)}>
                                    <title>{`${a.category}: ${S(a.total)} (${(a.frac * 100).toFixed(1)}%)`}</title>
                                </path>
                            ))}
                            <ellipse className="pie3d__fx" cx={CX} cy={CY} rx={RX} ry={RY} fill="url(#pie3d-gloss)" />
                            {arcs.map(a => (a.frac >= 0.06 || single) && (
                                <text key={'t' + a.category} className="pie3d__pct" x={a.lx} y={a.ly + 4} textAnchor="middle">
                                    {Math.round(a.frac * 100)}%
                                </text>
                            ))}
                        </svg>
                        <ul className="pie-legend">
                            {arcs.map(a => (
                                <li key={a.category} className={'pie-legend__row' + (hover === a.i ? ' is-hover' : '')} {...on(a.i)}>
                                    <span className="pie-legend__dot" style={{ background: a.color }} />
                                    <span className="pie-legend__name" title={a.category}>{a.category}</span>
                                    <span className="pie-legend__val">{S0(a.total)}<span>{(a.frac * 100).toFixed(1)}%</span></span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}