import { useCallback, useEffect, useState } from 'react';
import type { Client, Order } from '@rotacerta/domain';
import { call } from '../app/api';
import { useStore } from '../app/store';
import { OrderDetail } from './OrderDetail';
import { Empty, Header, Modal, OrderPill } from './ui';

type Row = Client & { orders: number };
interface Search { items: Row[]; total: number }
const PAGE = 15;
const message = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir a operação.');

/** Cadastro de clientes: buscar, ver o histórico, corrigir dados, unir duplicados e remover cadastros sem entregas. */
export function Clientes() {
  const { data } = useStore();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<Search>({ items: [], total: 0 });
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(() => {
    const url = `/clients?q=${encodeURIComponent(q)}&limit=${PAGE}&offset=${page * PAGE}`;
    return call<Search>('GET', url).then((r) => { setResult(r); setError(''); }).catch((e) => setError(message(e)));
  }, [q, page]);
  // espera a pessoa terminar de digitar; recarrega também quando os dados mudam (outro aparelho, nova entrega)
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load, data]);

  const pages = Math.max(1, Math.ceil(result.total / PAGE));

  return (
    <>
      <Header title="Clientes." subtitle="Cadastro, histórico de entregas e correções." />
      <section className="card">
        <label className="field">Buscar por nome ou telefone
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Ex.: maria ou 0101" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        {result.items.length === 0 ? <Empty>Nenhum cliente encontrado.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nome</th><th>Telefone</th><th>Bairro</th><th>Entregas</th><th></th></tr></thead>
              <tbody>
                {result.items.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td><td>{c.phone}</td><td>{c.neighborhood}</td><td>{c.orders}</td>
                    <td><button type="button" onClick={() => setOpen(c.id)}>Abrir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="actions">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span className="muted small">{result.total} cliente(s) · página {page + 1} de {pages}</span>
          <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Próxima</button>
        </div>
      </section>
      {open !== null && <ClientDialog id={open} onClose={() => setOpen(null)} onChanged={() => void load()} />}
    </>
  );
}

function ClientDialog({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data, command } = useStore();
  const [client, setClient] = useState<Client | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [form, setForm] = useState<Client | null>(null);
  const [applyToOpen, setApplyToOpen] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [mergeQ, setMergeQ] = useState('');
  const [candidates, setCandidates] = useState<Row[]>([]);
  const [detail, setDetail] = useState<number | null>(null);

  const reload = useCallback(() => call<{ client: Client; orders: Order[] }>('GET', `/clients/${id}`).then((r) => { setClient(r.client); setForm(r.client); setOrders(r.orders); }).catch((e) => setError(message(e))), [id]);
  useEffect(() => { void reload(); }, [reload, data]);

  useEffect(() => {
    if (mergeQ.trim().length < 2) { setCandidates([]); return; }
    const t = setTimeout(() => void call<Search>('GET', `/clients?q=${encodeURIComponent(mergeQ)}&limit=6`).then((r) => setCandidates(r.items.filter((c) => c.id !== id))).catch(() => undefined), 250);
    return () => clearTimeout(t);
  }, [mergeQ, id]);

  if (!client || !form) return <Modal title="Cliente" onClose={onClose}>{error ? <p className="error" role="alert">{error}</p> : <p className="muted">Carregando…</p>}</Modal>;
  const set = <K extends keyof Client>(k: K, v: Client[K]) => setForm((s) => (s ? { ...s, [k]: v } : s));

  const save = async () => {
    setError(''); setInfo('');
    const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => k !== 'id' && v !== client[k as keyof Client]));
    if (!Object.keys(changed).length) { setError('Nada foi alterado.'); return; }
    const err = await command({ method: 'PATCH', path: `/clients/${id}`, body: { ...changed, applyToOpen } });
    if (err) setError(err); else { setInfo('Cadastro atualizado.'); onChanged(); }
  };
  const merge = async (dupId: number, name: string) => {
    if (!confirm(`Unir o cadastro de ${name} a este? As entregas dele passam para ${client.name} e o cadastro duplicado some.`)) return;
    setError('');
    const err = await command({ method: 'POST', path: `/clients/${id}/merge`, body: { mergeId: dupId } });
    if (err) setError(err); else { setMergeQ(''); setInfo('Cadastros unidos.'); onChanged(); }
  };
  const remove = async () => {
    if (!confirm(`Remover o cadastro de ${client.name}?`)) return;
    const err = await command({ method: 'DELETE', path: `/clients/${id}` });
    if (err) setError(err); else { onChanged(); onClose(); }
  };

  return (
    <Modal title={client.name} onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Fechar</button>
      <button type="button" className="primary" onClick={() => void save()}>Salvar cadastro</button>
    </>}>
      <label className="field">Nome<input value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
      <label className="field">Telefone<input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></label>
      <label className="field">Bairro
        <select value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)}>{data.neighborhoods.map((n) => <option key={n.name} value={n.name}>{n.name}</option>)}</select>
      </label>
      <label className="field">Rua<input value={form.street} onChange={(e) => set('street', e.target.value)} /></label>
      <label className="field">Número<input value={form.number} onChange={(e) => set('number', e.target.value)} /></label>
      <label className="field">Complemento<input value={form.complement} onChange={(e) => set('complement', e.target.value)} /></label>
      <label className="field">Referência<input value={form.reference} onChange={(e) => set('reference', e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} /> Autorizou avisos por WhatsApp</label>
      <label className="check"><input type="checkbox" checked={applyToOpen} onChange={(e) => setApplyToOpen(e.target.checked)} /> Aplicar também às entregas que ainda não saíram</label>
      {error && <p className="error" role="alert">{error}</p>}
      {info && <p className="muted" role="status">{info}</p>}

      <div>
        <small className="muted">Histórico ({orders.length} entrega{orders.length === 1 ? '' : 's'})</small>
        {orders.length === 0 ? <div className="muted">Sem entregas.</div> : orders.map((o) => (
          <div className="detail-vol" key={o.id}>
            <span><button type="button" className="link" onClick={() => setDetail(o.id)}>#{o.id}</button> <span className="muted small">· {o.created} · {o.street}, {o.number}</span></span>
            <OrderPill status={o.status} />
          </div>
        ))}
      </div>

      <div>
        <small className="muted">Unir cadastro duplicado</small>
        <input value={mergeQ} onChange={(e) => setMergeQ(e.target.value)} placeholder="Buscar o duplicado por nome ou telefone" />
        {candidates.map((c) => (
          <div className="detail-vol" key={c.id}>
            <span>{c.name} <span className="muted small">· {c.phone} · {c.orders} entrega(s)</span></span>
            <button type="button" onClick={() => void merge(c.id, c.name)}>Unir a este</button>
          </div>
        ))}
      </div>

      {orders.length === 0 && <button type="button" className="danger" onClick={() => void remove()}>Remover cadastro</button>}
      {detail !== null && <OrderDetail orderId={detail} onClose={() => setDetail(null)} />}
    </Modal>
  );
}
