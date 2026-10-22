import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Notification } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Header } from './ui';

const STATUS: Record<Notification['status'], [string, string]> = {
  queued: ['Na fila', 'blue'], delivered: ['Enviado (simulado)', 'green'], failed: ['Falhou', 'red'], skipped: ['Não enviado', 'amber'],
};
const EVENT: Record<Notification['event'], string> = { rota_iniciada: 'Início da viagem', entrega_concluida: 'Próxima parada' };

export function Notificacoes() {
  const { data, retryNotice } = useStore();
  const list = data.notifications;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const selected = list.find((n) => n.id === selectedId) ?? list[0];
  const count = (s: Notification['status']) => list.filter((n) => n.status === s).length;

  const retry = (id: string) => setError(retryNotice(id) ?? '');

  return (
    <>
      <Header title="A informação chega antes da compra." subtitle="Acompanhe os avisos gerados pelas mudanças de status."
        actions={<Link className="btn primary" to="/motorista">Testar com o motorista</Link>} />
      <section className="card">
        <div className="card-head"><h2>WhatsApp automático por evento</h2><span className="pill amber">API não conectada · simulação</span></div>
        <p className="muted small">Uma entrega concluída aciona o aviso da próxima parada. Sem envio real e com telefones fictícios.</p>
        <div className="kpis">
          <div className="card kpi"><span className="muted">Avisos simulados</span><strong>{count('delivered')}</strong></div>
          <div className="card kpi"><span className="muted">Falhas simuladas</span><strong>{count('failed')}</strong><span className="muted small">Disponíveis para novo teste</span></div>
          <div className="card kpi"><span className="muted">Sem autorização</span><strong>{count('skipped')}</strong><span className="muted small">Aviso não disparado</span></div>
        </div>
      </section>
      {error && <div className="banner" role="alert">{error}</div>}

      <div className="scan-layout">
        <section className="card">
          <h2>Histórico de notificações</h2>
          <p className="muted small">{list.length} eventos · proteção contra duplicidade por parada</p>
          {list.length === 0 ? <p className="muted">Nenhum aviso ainda. Inicie uma viagem para gerar o primeiro.</p> : list.map((n) => {
            const [label, tone] = STATUS[n.status];
            return (
              <div className={`row-item ${selected?.id === n.id ? 'sel' : ''}`} key={n.id}>
                <button type="button" className="textbtn" style={{ textAlign: 'left' }} onClick={() => setSelectedId(n.id)}>
                  <strong>{n.name}</strong> <span className="muted small">{EVENT[n.event]} · Romaneio #{n.routeId} · {n.created}</span>
                </button>
                <span className="actions">
                  <span className={`pill ${tone}`}>{label}</span>
                  {n.status === 'failed' && <button type="button" onClick={() => retry(n.id)}>Reenviar</button>}
                </span>
              </div>
            );
          })}
        </section>
        {selected && <Preview n={selected} onRetry={() => retry(selected.id)} />}
      </div>
    </>
  );
}

function Preview({ n, onRetry }: { n: Notification; onRetry: () => void }) {
  const [phone, setPhone] = useState('');
  const digits = phone.replace(/\D/g, '');
  const valid = digits.length === 10 || digits.length === 11;
  const [label, tone] = STATUS[n.status];
  return (
    <aside className="card">
      <div className="card-head"><h2>Prévia da mensagem</h2><span className="pill blue">Simulação</span></div>
      <div className="wa-bubble"><small>Amaro Supermercados</small><p>{n.message}</p></div>
      <div className="summary-line"><span>Para</span><strong>{n.name} · {n.phone}</strong></div>
      <div className="summary-line"><span>Evento</span><strong>{EVENT[n.event]}</strong></div>
      <div className="summary-line"><span>Entrega</span><strong>#{n.orderId}</strong></div>
      <div className="summary-line"><span>Resultado</span><span className={`pill ${tone}`}>{label}</span></div>
      {n.reason && <p className="error small">{n.reason}</p>}
      {n.status === 'failed' && <button type="button" className="primary" onClick={onRetry}>Reenviar aviso</button>}

      <h3 style={{ marginTop: 18 }}>Teste de WhatsApp</h3>
      <p className="muted small">Abre uma conversa manual no seu WhatsApp com esta mensagem preenchida, para um número de teste seu ou autorizado. O sistema não envia nada e o cadastro do cliente não muda.</p>
      <label className="field">Número de teste (com DDD)
        <input type="tel" inputMode="tel" maxLength={24} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="DDD + número do WhatsApp" />
      </label>
      {valid
        ? <a className="btn primary" href={`https://wa.me/55${digits}?text=${encodeURIComponent(n.message)}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Abrir conversa de teste</a>
        : <button type="button" className="primary" disabled>Abrir conversa de teste</button>}
    </aside>
  );
}
