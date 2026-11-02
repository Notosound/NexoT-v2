// Gráficos del panel: SVG/HTML propios, sin librerías.
// Reglas (skill de visualización): colores de serie en orden fijo y nunca
// el color solo — siempre leyenda o etiqueta; marcas delgadas; separación
// de 2px entre segmentos; ayuda al pasar el mouse en cada marca.
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { formatoNumero } from '../lib/utilidades';

export const SERIES = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-7)'];

interface Burbuja { x: number; y: number; contenido: ReactNode }
function useBurbuja() {
  const caja = useRef<HTMLDivElement>(null);
  const [b, setB] = useState<Burbuja | null>(null);
  const mostrar = (e: { clientX: number; clientY: number }, contenido: ReactNode) => {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    setB({ x: e.clientX - r.left, y: e.clientY - r.top, contenido });
  };
  const nodo = b && <div className="burbuja" style={{ left: b.x, top: b.y }}>{b.contenido}</div>;
  return { caja, mostrar, ocultar: () => setB(null), nodo };
}

export function Leyenda({ series }: { series: { nombre: string; color: string }[] }) {
  return (
    <div className="leyenda">
      {series.map((s) => <span key={s.nombre}><i style={{ background: s.color }} />{s.nombre}</span>)}
    </div>
  );
}

// ── Barras horizontales (una serie o apiladas) ──────────────────────
export interface FilaBarra { nombre: string; valores: number[]; detalle?: string }
export function BarrasH({ filas, series, max: maxFijo, sufijo = '', vacio = 'Sin datos todavía', limite, alElegir }: {
  filas: FilaBarra[]; series?: { nombre: string; color: string }[]; max?: number; sufijo?: string; vacio?: string; limite?: number;
  alElegir?: (nombre: string) => void;
}) {
  const { caja, mostrar, ocultar, nodo } = useBurbuja();
  const [todas, setTodas] = useState(false);
  const visibles = limite && !todas ? filas.slice(0, limite) : filas;
  const max = maxFijo ?? Math.max(1, ...visibles.map((f) => f.valores.reduce((a, b) => a + b, 0)));
  const colores = series?.map((s) => s.color) ?? [SERIES[0]];
  if (!visibles.length) return <p className="vacio">{vacio}</p>;
  return (
    <div className="grafico" ref={caja} onMouseLeave={ocultar}>
      <div className="barras-h" role="list">
        {visibles.map((f) => {
          const total = f.valores.reduce((a, b) => a + b, 0);
          const detalle = (
            <>
              <strong>{f.nombre}</strong>
              {series && series.length > 1
                ? series.map((s, i) => <span key={s.nombre} style={{ display: 'block' }}>{s.nombre}: {formatoNumero(f.valores[i] ?? 0)}{sufijo}</span>)
                : <span>{formatoNumero(total)}{sufijo}</span>}
              {f.detalle && <span style={{ display: 'block', color: 'var(--texto-3)' }}>{f.detalle}</span>}
            </>
          );
          return (
            <div className={`barra-h${alElegir ? ' elegible' : ''}`} role="listitem" key={f.nombre} onMouseMove={(e) => mostrar(e, detalle)}
              onClick={alElegir ? () => alElegir(f.nombre) : undefined}>
              {alElegir
                ? <button type="button" className="nombre enlace-barra" title={`Ver ${f.nombre}`}>{f.nombre}</button>
                : <span className="nombre" title={f.nombre}>{f.nombre}</span>}
              <span className="pista" aria-hidden>
                {f.valores.map((v, i) => v > 0 && (
                  <span key={i} style={{ width: `${(100 * v) / max}%`, background: colores[i % colores.length] }} />
                ))}
              </span>
              <span className="num">{formatoNumero(total)}{sufijo}</span>
            </div>
          );
        })}
      </div>
      {limite && filas.length > limite && (
        <button type="button" className="ver-todas" onClick={() => setTodas(!todas)}>{todas ? 'Ver menos' : `Ver todas (${filas.length})`}</button>
      )}
      {series && series.length > 1 && <Leyenda series={series} />}
      {nodo}
    </div>
  );
}

// ── Dona (partes de un todo, pocas categorías) ──────────────────────
export function Dona({ partes, centro, sub }: { partes: { nombre: string; valor: number; color: string }[]; centro?: string; sub?: string }) {
  const { caja, mostrar, ocultar, nodo } = useBurbuja();
  const total = partes.reduce((a, p) => a + p.valor, 0);
  const R = 50, r = 34, C = 60;
  let angulo = -Math.PI / 2;
  const hueco = partes.filter((p) => p.valor > 0).length > 1 ? 0.025 : 0; // 2px de separación aprox.
  const arcos = partes.filter((p) => p.valor > 0).map((p) => {
    const a = (p.valor / total) * Math.PI * 2;
    const a0 = angulo + hueco / 2, a1 = angulo + a - hueco / 2;
    angulo += a;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    const pt = (rad: number, ang: number) => `${C + rad * Math.cos(ang)} ${C + rad * Math.sin(ang)}`;
    const d = a >= Math.PI * 2 - 0.001
      ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R} L ${C - 0.01} ${C - r} A ${r} ${r} 0 1 0 ${C} ${C - r} Z`
      : `M ${pt(R, a0)} A ${R} ${R} 0 ${grande} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${grande} 0 ${pt(r, a0)} Z`;
    return { ...p, d };
  });
  return (
    <div className="dona-envoltura">
      <div className="grafico" ref={caja} onMouseLeave={ocultar}>
        <svg viewBox="0 0 120 120" role="img" aria-label={partes.map((p) => `${p.nombre}: ${p.valor}`).join(', ')}>
          {total === 0 && <circle cx={C} cy={C} r={(R + r) / 2} style={{ fill: 'none', stroke: 'var(--pista)' }} strokeWidth={R - r} />}
          {arcos.map((a) => (
            <path key={a.nombre} d={a.d} style={{ fill: a.color }}
              onMouseMove={(e) => mostrar(e, <><strong>{a.nombre}</strong>{formatoNumero(a.valor)} · {Math.round((100 * a.valor) / total)}%</>)} />
          ))}
          <text x={C} y={C + 4} textAnchor="middle" className="dona-centro">{centro ?? formatoNumero(total)}</text>
          {sub && <text x={C} y={C + 18} textAnchor="middle" className="dona-sub">{sub}</text>}
        </svg>
        {nodo}
      </div>
      <div className="leyenda">
        {partes.map((p) => (
          <span key={p.nombre}><i style={{ background: p.color }} />{p.nombre}: <strong>{formatoNumero(p.valor)}</strong>
            {total > 0 && <span style={{ color: 'var(--texto-3)' }}>({Math.round((100 * p.valor) / total)}%)</span>}</span>
        ))}
      </div>
    </div>
  );
}

// ── Línea en el tiempo, con área y cruz al pasar el mouse ───────────
export function Linea({ puntos, color = SERIES[0], alto = 180, nombre = 'Valor' }: {
  puntos: { etiqueta: string; valor: number }[]; color?: string; alto?: number; nombre?: string;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const id = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const ancho = 640, izq = 34, der = 10, arr = 12, aba = 26;
  const n = puntos.length;
  const max = useMemo(() => {
    const m = Math.max(1, ...puntos.map((p) => p.valor));
    const paso = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / paso) * paso;
  }, [puntos]);
  if (!n) return <p className="vacio">Sin datos todavía</p>;
  const x = (i: number) => izq + (n === 1 ? (ancho - izq - der) / 2 : (i * (ancho - izq - der)) / (n - 1));
  const y = (v: number) => arr + (alto - arr - aba) * (1 - v / max);
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p.valor)}`).join(' ');
  const area = `${linea} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;
  const marcas = [0, max / 2, max];
  const cadaEtiqueta = Math.max(1, Math.ceil(n / 7));
  const total = puntos.reduce((a, p) => a + p.valor, 0);
  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`${nombre}: ${formatoNumero(total)} en total`}
        onMouseLeave={() => setActivo(null)}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * ancho;
          const i = Math.round(((px - izq) / (ancho - izq - der)) * (n - 1));
          setActivo(Math.min(n - 1, Math.max(0, i)));
        }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: color, stopOpacity: 0.22 }} />
            <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        {marcas.map((m) => (
          <g key={m}>
            <line className={m === 0 ? 'linea-base' : 'rejilla-linea'} x1={izq} x2={ancho - der} y1={y(m)} y2={y(m)} />
            <text className="eje" x={izq - 6} y={y(m) + 4} textAnchor="end">{formatoNumero(m)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#${id})`} />
        <path d={linea} style={{ fill: 'none', stroke: color }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {puntos.map((p, i) => ((i % cadaEtiqueta === 0 && n - 1 - i >= cadaEtiqueta / 2) || i === n - 1) && (
          <text key={i} className="eje" x={x(i)} y={alto - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{p.etiqueta}</text>
        ))}
        {activo != null && (
          <g>
            <line x1={x(activo)} x2={x(activo)} y1={arr} y2={y(0)} style={{ stroke: 'var(--borde-fuerte)' }} strokeDasharray="3 3" />
            <circle cx={x(activo)} cy={y(puntos[activo].valor)} r={5} style={{ fill: color, stroke: 'var(--superficie)' }} strokeWidth={2} />
          </g>
        )}
      </svg>
      {activo != null && (
        <div className="burbuja" style={{ left: `${(x(activo) / ancho) * 100}%`, top: `${(y(puntos[activo].valor) / alto) * 100}%` }}>
          <strong>{puntos[activo].etiqueta}</strong>{formatoNumero(puntos[activo].valor)} {nombre.toLowerCase()}
        </div>
      )}
    </div>
  );
}

// ── Barra segmentada de avance (partes de un total) ─────────────────
export function Segmentos({ partes, alto = 14 }: { partes: { nombre: string; valor: number; color: string }[]; alto?: number }) {
  const { caja, mostrar, ocultar, nodo } = useBurbuja();
  const total = partes.reduce((a, p) => a + p.valor, 0);
  return (
    <div className="grafico" ref={caja} onMouseLeave={ocultar}>
      <div className="barra-avance" style={{ height: alto }} role="img" aria-label={partes.map((p) => `${p.nombre}: ${p.valor}`).join(', ')}>
        {partes.filter((p) => p.valor > 0).map((p) => (
          <div key={p.nombre} style={{ width: `${(100 * p.valor) / total}%`, background: p.color }}
            onMouseMove={(e) => mostrar(e, <><strong>{p.nombre}</strong>{formatoNumero(p.valor)} · {Math.round((100 * p.valor) / total)}%</>)} />
        ))}
      </div>
      <Leyenda series={partes.map((p) => ({ nombre: `${p.nombre} (${formatoNumero(p.valor)})`, color: p.color }))} />
      {nodo}
    </div>
  );
}

// ── Pirámide de edad por sexo ───────────────────────────────────────
export function Piramide({ filas }: { filas: { rango: string; mujeres: number; hombres: number }[] }) {
  const { caja, mostrar, ocultar, nodo } = useBurbuja();
  const max = Math.max(1, ...filas.flatMap((f) => [f.mujeres, f.hombres]));
  return (
    <div className="grafico" ref={caja} onMouseLeave={ocultar}>
      <div className="piramide">
        {[...filas].reverse().map((f) => (
          <div className="piramide-fila" key={f.rango}
            onMouseMove={(e) => mostrar(e, <><strong>{f.rango} años</strong>Mujeres: {formatoNumero(f.mujeres)} · Hombres: {formatoNumero(f.hombres)}</>)}>
            <span className="num">{formatoNumero(f.mujeres)}</span>
            <span className="lado izq"><span className="barra-p" style={{ width: `${(100 * f.mujeres) / max}%`, background: SERIES[0] }} /></span>
            <span className="rango">{f.rango}</span>
            <span className="lado der"><span className="barra-p" style={{ width: `${(100 * f.hombres) / max}%`, background: SERIES[1] }} /></span>
            <span className="num">{formatoNumero(f.hombres)}</span>
          </div>
        ))}
      </div>
      <Leyenda series={[{ nombre: 'Mujeres', color: SERIES[0] }, { nombre: 'Hombres', color: SERIES[1] }]} />
      {nodo}
    </div>
  );
}
