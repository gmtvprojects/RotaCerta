import { Skeleton } from '@astryxdesign/core/Skeleton';

/**
 * Esqueletos de carregamento: blocos cinza com brilho suave (o `Skeleton` do Astryx) no formato do que vai aparecer.
 * Mantêm o layout no lugar enquanto os dados chegam, sem "pulo" quando o conteúdo entra.
 * Todos anunciam "Carregando" para leitores de tela e respeitam a preferência de reduzir movimento.
 */

const Box = ({ w = '100%', h = 14, r = 2, i = 0 }: { w?: number | string; h?: number | string; r?: 'none' | 0 | 1 | 2 | 3 | 4 | 'rounded'; i?: number }) => (
  <Skeleton width={w} height={h} radius={r} index={i} />
);

/** Algumas linhas de texto (a última mais curta). */
export function SkeletonLines({ lines = 3, gap = 10 }: { lines?: number; gap?: number }) {
  return (
    <div className="sk-lines" style={{ gap }} role="status" aria-label="Carregando">
      {Array.from({ length: lines }, (_, i) => <Box key={i} w={i === lines - 1 ? '60%' : '100%'} h={12} i={i} />)}
    </div>
  );
}

/** Linhas de uma lista: avatar, duas linhas de texto e um selo. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="sk-list" role="status" aria-label="Carregando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-row">
          <Box w={36} h={36} r="rounded" i={i} />
          <div className="sk-col"><Box w={`${55 - (i % 3) * 8}%`} h={13} i={i} /><Box w={`${35 + (i % 2) * 10}%`} h={11} i={i} /></div>
          <Box w={72} h={22} r="rounded" i={i} />
        </div>
      ))}
    </div>
  );
}

/** Tabela: cabeçalho e linhas. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="sk-table" role="status" aria-label="Carregando" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: cols }, (_, c) => <Box key={`h${c}`} h={12} w="60%" />)}
      {Array.from({ length: rows * cols }, (_, k) => <Box key={k} h={14} w={`${60 + ((k * 37) % 35)}%`} i={Math.floor(k / cols)} />)}
    </div>
  );
}

/** Cartões de números (como os do painel). */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="sk-stats" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card sk-card"><Box w="50%" h={12} i={i} /><Box w="35%" h={30} i={i} /><Box w="65%" h={11} i={i} /></div>
      ))}
    </div>
  );
}

/** Grade de cartões (hubs de Configurações e Agentes). */
export function TilesSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="conf-grid" role="status" aria-label="Carregando">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card sk-card"><Box w={40} h={40} r={3} i={i} /><Box w="55%" h={15} i={i} /><Box w="85%" h={11} i={i} /><Box w={110} h={22} r="rounded" i={i} /></div>
      ))}
    </div>
  );
}

const Head = () => (
  <div className="sk-head"><Box w={260} h={28} /><Box w={360} h={13} /></div>
);

export type PageShape = 'dashboard' | 'list' | 'split' | 'map' | 'form' | 'tiles' | 'table';

/** Tela inteira enquanto o código da página chega (troca de tela) — no formato dela. */
export function PageSkeleton({ shape = 'list' }: { shape?: PageShape }) {
  return (
    <div className="sk-page" role="status" aria-label="Carregando a tela">
      <Head />
      {shape === 'dashboard' && <>
        <StatsSkeleton />
        <div className="sk-split"><div className="card"><SkeletonLines lines={6} gap={16} /></div><div className="card"><ListSkeleton rows={5} /></div></div>
      </>}
      {shape === 'list' && <div className="card"><ListSkeleton rows={7} /></div>}
      {shape === 'table' && <div className="card"><TableSkeleton rows={7} /></div>}
      {shape === 'split' && <div className="sk-split"><div className="card"><ListSkeleton rows={6} /></div><div className="card"><SkeletonLines lines={7} /></div></div>}
      {shape === 'map' && <div className="sk-split wide"><div className="card"><Box h="min(60vh, 520px)" r={3} /></div><div className="card"><ListSkeleton rows={3} /></div></div>}
      {shape === 'form' && <div className="card sk-form">{Array.from({ length: 6 }, (_, i) => <div key={i} className="sk-col"><Box w={120} h={12} i={i} /><Box h={40} r={3} i={i} /></div>)}</div>}
      {shape === 'tiles' && <TilesSkeleton />}
    </div>
  );
}

/** App inteiro enquanto a sessão e os dados carregam: menu, topo e o conteúdo. */
export function AppSkeleton() {
  return (
    <div className="shell sk-app" role="status" aria-label="Carregando o RotaCerta">
      <aside className="sk-side">
        <div className="sk-brand"><Box w={32} h={32} r={3} /><Box w={110} h={18} /></div>
        <Box h={38} r={3} />
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="sk-nav"><Box w={18} h={18} r={1} i={i} /><Box w={`${50 + ((i * 23) % 40)}%`} h={12} i={i} /></div>)}
      </aside>
      <div className="sk-main">
        <div className="sk-top"><Box w={70} h={22} r="rounded" /><Box w={32} h={32} r="rounded" /></div>
        <div className="sk-content"><PageSkeleton shape="dashboard" /></div>
      </div>
    </div>
  );
}
