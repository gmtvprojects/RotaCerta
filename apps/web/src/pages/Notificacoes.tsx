import { useStore } from '../app/store';
import { Header } from './ui';

export function Notificacoes() {
  const { data } = useStore();
  return (
    <>
      <Header title="A informação chega antes da compra." subtitle="Avisos gerados pelas mudanças de status. O envio por WhatsApp ainda é simulado." />
      <section className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Hora</th><th>Cliente</th><th>Evento</th><th>Mensagem</th><th>Envio</th></tr></thead>
            <tbody>
              {data.notifications.map((n) => (
                <tr key={n.id}>
                  <td>{n.created}</td><td>{n.name}<div className="muted small">{n.phone}</div></td>
                  <td>{n.event === 'rota_iniciada' ? 'Rota iniciada' : 'Entrega concluída'}</td>
                  <td className="small">{n.message}</td>
                  <td><span className={`pill ${n.status === 'delivered' ? 'green' : n.status === 'skipped' ? 'amber' : 'red'}`}>{n.status === 'delivered' ? 'Enviado' : n.status === 'skipped' ? 'Não enviado' : 'Falhou'}</span>{n.reason && <div className="muted small">{n.reason}</div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
