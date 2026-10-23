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

/* ------------------------------------------------------------------ Pastel: ventas por categoría */
const COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];
const MAX_SLICES = 7;
const CX = 100;
const CY = 100;
const R = 92;

const polar = (a: number) => [CX + R * Math.sin(a), CY - R * Math.cos(a)] as const;

export function CategorySalesChart({ data, rangeLabel }: { data: CategorySale[]; rangeLabel: string }) {
    const [hover, setHover] = useState<number | null>(null);

    // Las categorías pequeñas se agrupan en "Otras" para que el pastel siga siendo legible.
    const sorted = [...data].filter(c => c.total > 0).sort((a, b) => b.total - a.total);
    const head = sorted.slice(0, MAX_SLICES);
    const rest = sorted.slice(MAX_SLICES);
    const slices = rest.length ? [...head, { category: 'Otras', total: rest.reduce((a, c) => a + c.total, 0), units: rest.reduce((a, c) => a + c.units, 0) }] : head;
    const total = slices.reduce((a, c) => a + c.total, 0);

    let acc = 0;
    const arcs = slices.map((c, i) => {
        const frac = c.total / total;
        const a0 = acc * 2 * Math.PI;
        acc += frac;
        const a1 = acc * 2 * Math.PI;
        const [x0, y0] = polar(a0);
        const [x1, y1] = polar(a1);
        const large = frac > 0.5 ? 1 : 0;
        const mid = (a0 + a1) / 2;
        const lx = CX + R * 0.62 * Math.sin(mid);
        const ly = CY - R * 0.62 * Math.cos(mid);
        return { ...c, i, frac, d: `M${CX} ${CY} L${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`, lx, ly, color: COLORS[i % COLORS.length] };
    });

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
                        <svg className={'pie-chart' + (hover !== null ? ' has-hover' : '')} viewBox="0 0 200 200" role="img" aria-label={`Ventas por categoría, ${rangeLabel}`}>
                            {arcs.length === 1 ? (
                                <circle className="pie-chart__slice" cx={CX} cy={CY} r={R} fill={arcs[0].color} />
                            ) : (
                                arcs.map(a => (
                                    <path key={a.category} d={a.d} fill={a.color} className={'pie-chart__slice' + (hover === a.i ? ' is-hover' : '')} onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)}>
                                        <title>{`${a.category}: ${S(a.total)} (${(a.frac * 100).toFixed(1)}%)`}</title>
                                    </path>
                                ))
                            )}
                            {arcs.map(a => (a.frac >= 0.06 || arcs.length === 1) && (
                                <text key={'t' + a.category} className="pie-chart__pct" x={arcs.length === 1 ? CX : a.lx} y={arcs.length === 1 ? CY + 4 : a.ly + 4} textAnchor="middle">
                                    {Math.round(a.frac * 100)}%
                                </text>
                            ))}
                        </svg>
                        <ul className="pie-legend">
                            {arcs.map(a => (
                                <li key={a.category} className={'pie-legend__row' + (hover === a.i ? ' is-hover' : '')} onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(null)}>
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