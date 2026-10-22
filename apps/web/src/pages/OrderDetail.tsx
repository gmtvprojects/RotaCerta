import { Link } from 'react-router-dom';
import { BOX_TYPE_LABELS, canAccess, volumesOf } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Modal, OrderPill } from './ui';

/** Ficha completa de uma entrega: endereço, volumes, romaneio, ficha de origem e histórico. */
export function OrderDetail({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const { data, papers, role } = useStore();
  const o = data.orders.find((x) => x.id === orderId);
  if (!o || !role) return null;
  const route = data.routes.find((r) => r.id === o.routeId);
  const driver = data.drivers.find((d) => d.id === route?.driverId);
  const paper = papers.find((p) => p.orderId === o.id);
  const vols = volumesOf(o);
  const canEditBoxes = !o.routeId && (o.status === 'awaiting' || o.status === 'ready') && canAccess(role, 'atendimento');

  return (
    <Modal title={`Entrega #${o.id}`} onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Fechar</button>
      {canEditBoxes && <Link className="btn primary" to={`/atendimento/caixas/${o.id}`} onClick={onClose}>Registrar volumes</Link>}
      {o.routeId && canAccess(role, 'romaneio') && <Link className="btn primary" to="/romaneios" onClick={onClose}>Ver romaneio</Link>}
    </>}>
      <div><strong>{o.name}</strong> <OrderPill status={o.status} />
        <div className="muted small">{o.phone} · contato fictício</div></div>

      <div className="detail-grid">
        <div><small className="muted">Endereço</small><div>{o.street}, {o.number} — {o.neighborhood}</div></div>
        <div><small className="muted">Horário solicitado</small><div>{o.window}</div></div>
        {(o.complement || o.reference) && <div><small className="muted">Complemento / referência</small><div>{[o.complement, o.reference].filter(Boolean).join(' · ')}</div></div>}
        <div><small className="muted">WhatsApp autorizado</small><div>{o.consent ? 'Sim' : 'Não — não recebe avisos'}</div></div>
        {o.notes && <div><small className="muted">Observações</small><div>{o.notes}</div></div>}
        {route && <div><small className="muted">Romaneio</small><div>#{route.id}{driver ? ` · ${driver.name}` : ''}</div></div>}
      </div>

      <div>
        <small className="muted">Volumes físicos ({vols.length})</small>
        {vols.length === 0 ? <div className="muted">Nenhuma caixa identificada ainda.</div> : vols.map((v) => (
          <div className="detail-vol" key={v.key}>
            <span><strong>{v.label}</strong> <span className="muted small">· {v.location}</span></span>
            {v.type === 'extra' ? <span className="pill amber">Fora da caixa</span> : <span className={`pill ${v.type === 'ambient' ? '' : 'blue'}`}>{BOX_TYPE_LABELS[v.type]}</span>}
          </div>
        ))}
      </div>

      {o.status === 'failed' && o.occurrence && (
        <div className="banner"><strong>Não entregue: {o.occurrence.reason}</strong>{o.occurrence.notes && <div>{o.occurrence.notes}</div>}</div>
      )}
      {o.receiver && <p className="muted small">Recebido por {o.receiver}{o.completed ? ` às ${o.completed}` : ''}.</p>}

      {paper && (
        <div className="notice">
          <strong>Cadastro pela ficha {paper.sheetNumber}.</strong>{' '}
          {paper.mode === 'example' ? 'Exemplo com leitura simulada.' : 'Foto própria revisada manualmente.'}{' '}
          {canAccess(role, 'atendimento') && <Link to={`/atendimento/ficha/${paper.id}`} onClick={onClose}>Ver ficha vinculada</Link>}
        </div>
      )}

      <div>
        <small className="muted">Histórico da entrega</small>
        <ol className="history">
          {o.history.slice().reverse().map((h, i) => <li key={i}><strong>{h.label}</strong> <span className="muted small">{h.time} · {h.actor}</span></li>)}
        </ol>
      </div>
    </Modal>
  );
}
