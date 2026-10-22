import { useStore } from '../app/store';
import { Empty, Header, RoutePill } from './ui';

export function Motorista() {
  const { data, role, driverId, startRoute, completeDelivery, failDelivery } = useStore();
  const driver = data.drivers.find((d) => d.id === driverId);
  const isAdmin = role === 'gestao';
  const active = data.routes.find((r) => r.status === 'active' && (r.driverId === driverId || isAdmin));
  const available = data.routes.filter((r) => r.status === 'released');

  if (active) {
    const stops = active.orders.map((id) => data.orders.find((o) => o.id === id)!).filter(Boolean);
    const done = stops.filter((o) => o.status === 'delivered' || o.status === 'failed').length;
    const next = stops.find((o) => o.status === 'onroute');
    return (
      <>
        <Header title="Minha rota de entregas." subtitle={`Romaneio #${active.id} · ${data.vehicles.find((v) => v.id === active.vehicleId)?.name}`} />
        <div className="progress"><span>Parada {Math.min(done + 1, stops.length)} de {stops.length}</span><div className="bar-track"><i style={{ width: `${(done / stops.length) * 100}%` }} /></div></div>
        {next ? (
          <section className="card next">
            <span className="eyebrow">PRÓXIMA ENTREGA · #{next.id}</span>
            <h2>{next.name}</h2>
            <p>{next.street}, {next.number}{next.complement && ` · ${next.complement}`} — {next.neighborhood}</p>
            {next.reference && <p className="muted">{next.reference}</p>}
            <p>{next.boxes.length} volumes · {next.cold} frio · {next.frozen} congelado{next.gas ? ` · ${next.gas} gás (fora das caixas)` : ''}</p>
            <div className="actions">
              <a className="btn" href={`tel:${next.phone.replace(/\D/g, '')}`}>Ligar</a>
              <button type="button" className="primary" onClick={() => completeDelivery(next.id)}>Concluir entrega</button>
              <button type="button" className="danger" onClick={() => failDelivery(next.id)}>Não consegui entregar</button>
            </div>
          </section>
        ) : <section className="card"><Empty>Todas as paradas foram registradas.</Empty></section>}
      </>
    );
  }

  return (
    <>
      <Header title="Escolha seu romaneio." subtitle={`Olá, ${driver?.name.split(' ')[0] ?? 'motorista'}. Qual viagem vamos fazer agora?`} />
      {available.length === 0 ? <section className="card"><Empty>Nenhum romaneio disponível agora. As cargas aparecem aqui assim que a expedição termina a conferência.</Empty></section> :
        available.map((r) => (
          <section key={r.id} className="card">
            <div className="card-head"><h2>Romaneio #{r.id}</h2><RoutePill status={r.status} /><span className="muted">saída {r.departure} · {r.orders.length} paradas</span></div>
            <button type="button" className="primary" onClick={() => startRoute(r.id)}>Iniciar viagem</button>
          </section>
        ))}
    </>
  );
}
