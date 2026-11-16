import { Card } from 'astrixui/components/ui/card.js';
import { Progress } from 'astrixui/components/ui/progress.js';
import { useEffect, useState } from 'react';
import { useStore } from '../app/store';
import { CountUp } from '../app/motion';
import { OrderDetail } from './OrderDetail';
import { Header, OrderPill } from './ui';

export function Dashboard() {
  const { data } = useStore();
  const [openId, setOpenId] = useState<number | null>(null);
  // as barras partem de zero e crescem ao abrir a tela
  const [grown, setGrown] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setGrown(true), 120); return () => window.clearTimeout(t); }, []);
  const count = (s: string) => data.orders.filter((o) => o.status === s).length;
  const total = data.orders.length || 1;
  // As etapas na ordem em que a entrega anda: do atendimento à porta do cliente.
  const flow = [
    ['Aguardando volumes', count('awaiting')],
    ['Prontas para planejar', count('ready') + count('queued')],
    ['Em carregamento', count('loading') + count('released')],
    ['Em rota', count('onroute')],
    ['Entregues', count('delivered')],
  ] as const;
  const failed = count('failed');

  return (
    <>
      <Header title="A operação, em movimento." subtitle="Do caixa à porta do cliente. Tudo no mesmo lugar." />
      <Card data-card className="card flow rounded-[18px] shadow-none" aria-label="Fluxo das entregas de hoje">
        {flow.map(([label, value], i) => (
          <div key={label} className={`flow-step ${i === flow.length - 1 ? 'end' : ''}`}>
            <strong><CountUp value={value} /></strong><span>{label}</span>
            <Progress value={grown ? (value / total) * 100 : 0} className="h-[5px] bg-[var(--sunk)] [&>div]:duration-1000 [&>div]:ease-out" aria-label={label} />
          </div>
        ))}
      </Card>
      <p className="muted small">{data.orders.length} entregas no total{failed > 0 ? ` · ${failed} não entregue(s), aguardando nova tentativa` : ''}.</p>
      <section className="card">
        <h2>Entregas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Entrega / cliente</th><th>Bairro</th><th>Horário</th><th>Volumes</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.orders.slice(0, 12).map((o) => (
                <tr key={o.id}>
                  <td><strong>#{o.id}</strong> {o.name}</td><td>{o.neighborhood}</td><td>{o.window}</td>
                  <td>{o.boxes.length}</td><td><OrderPill status={o.status} /></td><td><button type="button" onClick={() => setOpenId(o.id)}>Detalhes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {openId != null && <OrderDetail orderId={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
