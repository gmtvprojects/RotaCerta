import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  BOX_TYPE_LABELS, DEFAULT_BOX_LOCATION, DELIVERY_WINDOWS, EMPTY_DELIVERY_FORM, boxesInUse,
  type BoxInput, type BoxType, type DeliveryForm,
} from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header, Modal, OrderPill } from './ui';
import { Counter } from '../app/motion';
import { FichaInicio, FichaModelo, FichaRevisao } from './FichaPapel';

export function Atendimento() {
  return (
    <Routes>
      <Route index element={<Balcao />} />
      <Route path="nova" element={<Balcao />} />
      <Route path="ficha" element={<FichaInicio />} />
      <Route path="ficha/:paperId" element={<FichaRevisao />} />
      <Route path="modelo" element={<FichaModelo />} />
      <Route path="caixas/:orderId" element={<IdentificarCaixas />} />
      <Route path="concluido/:orderId" element={<Concluido />} />
      <Route path="*" element={<Navigate to="/atendimento" replace />} />
    </Routes>
  );
}

function Steps({ current }: { current: 1 | 2 | 3 }) {
  const items = ['Cliente e endereço', 'Volumes, após o caixa', 'Concluído'];
  return (
    <ol className="steps">
      {items.map((label, i) => (
        <li key={label} className={i + 1 === current ? 'on' : i + 1 < current ? 'done' : ''}>
          <span>{i + 1 < current ? '✓' : i + 1}</span>{label}
        </li>
      ))}
    </ol>
  );
}

const digits = (v: string) => v.replace(/\D/g, '');

/** Tela única do atendimento: busca o cliente, cadastra a entrega em três blocos e mostra a fila do dia ao lado. */
function Balcao() {
  const { data, draft, saveDraft, createOrder, user } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState<DeliveryForm>(draft ?? EMPTY_DELIVERY_FORM);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [columns, setColumns] = useState(false);
  const [editAddress, setEditAddress] = useState(false);

  const touched = JSON.stringify(form) !== JSON.stringify(EMPTY_DELIVERY_FORM);
  useEffect(() => { saveDraft(touched ? form : null); }, [form, touched, saveDraft]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 3) return [];
    return data.clients.filter((c) => digits(c.phone).includes(digits(q)) && digits(q) !== '' || c.name.toLowerCase().includes(q)).slice(0, 5);
  }, [search, data.clients]);

  const set = (k: keyof DeliveryForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value, ...(k === 'phone' || k === 'name' ? { clientId: null } : {}) }));

  const pick = (id: number) => {
    const c = data.clients.find((x) => x.id === id);
    if (!c) return;
    setForm((f) => ({ ...f, clientId: c.id, name: c.name, phone: c.phone, neighborhood: c.neighborhood, street: c.street, number: c.number, complement: c.complement, reference: c.reference, consent: c.consent }));
    setSearch('');
    setEditAddress(false);
  };

  const submit = async () => {
    const missing = (['name', 'phone', 'neighborhood', 'street', 'number'] as const).filter((k) => !form[k].trim());
    if (missing.length) { setError('Preencha nome, telefone, bairro, rua e número.'); return; }
    setError('');
    try {
      const id = await createOrder(form);
      saveDraft(null);
      navigate(`/atendimento/caixas/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cadastrar a entrega.');
    }
  };
  const discard = () => { setForm(EMPTY_DELIVERY_FORM); saveDraft(null); setEditAddress(false); };

  const awaiting = data.orders.filter((o) => o.status === 'awaiting');
  const delivered = data.orders.filter((o) => o.status === 'delivered');
  const inProgress = data.orders.filter((o) => ['ready', 'queued', 'loading', 'released', 'onroute'].includes(o.status));
  const recent = [...data.orders].filter((o) => o.status !== 'awaiting').sort((a, b) => b.id - a.id).slice(0, 5);

  const known = form.clientId != null;
  const clientDone = !!form.name.trim() && !!form.phone.trim();
  const addressDone = !!form.neighborhood && !!form.street.trim() && !!form.number.trim();
  const first = (user?.name ?? '').split(' ')[0];
  const date = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const stepHead = (n: number, title: string, done: boolean, summary?: string) => (
    <div className="bal-step-head">
      <span className={`bal-n ${done ? 'ok' : ''}`}>{done ? '✓' : n}</span>
      <h3>{title}</h3>
      {done && summary && <span className="muted small">{summary}</span>}
    </div>
  );
  const orderLine = (o: (typeof data.orders)[number]) => (
    <div className="bal-line" key={o.id}>
      <div><strong>{o.name}</strong><span className="muted small">#{o.id} · {o.neighborhood}</span></div>
      {o.status === 'awaiting' ? <Link className="btn sm" to={`/atendimento/caixas/${o.id}`}>Registrar caixas</Link> : <OrderPill status={o.status} />}
    </div>
  );

  const columnsData: Array<[string, Array<{ id: number; name: string; neighborhood: string; status: (typeof data.orders)[number]['status'] }>]> = [
    ['Rascunho', touched ? [{ id: 0, name: form.name || 'Novo cadastro', neighborhood: form.neighborhood || 'em preenchimento', status: 'draft' }] : []],
    ['Aguardando caixas', awaiting],
    ['Em andamento', inProgress],
    ['Entregues', delivered],
  ];

  return (
    <>
      <header className="page-head"><div><span className="eyebrow">{date}</span><h1>{first ? `Olá, ${first}` : 'Atendimento'}</h1></div></header>

      <div className="bal-stats">
        <div className="rt-stat"><span>Aguardando caixas</span><b><Counter to={awaiting.length} /></b></div>
        <div className="rt-stat"><span>Em andamento</span><b><Counter to={inProgress.length} /></b></div>
        <div className="rt-stat"><span>Entregues</span><b className="green"><Counter to={delivered.length} /></b></div>
      </div>

      <div className="bal-grid">
        <section className="card bal-form" aria-label="Nova entrega">
          <div className="card-head">
            <h2>Nova entrega</h2>
            {touched && <span className="actions"><span className="pill green">Rascunho salvo</span><button type="button" className="link" onClick={discard}>Descartar</button></span>}
          </div>

          <div className="bal-search">
            <span aria-hidden="true">⌕</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente por telefone ou nome" aria-label="Buscar cliente por telefone ou nome" />
          </div>
          {matches.length > 0 && (
            <ul className="suggest">
              {matches.map((c) => (
                <li key={c.id}><button type="button" onClick={() => pick(c.id)}>
                  <strong>{c.name}</strong> <span className="muted">{c.phone} · {c.street}, {c.number} — {c.neighborhood}</span>
                </button></li>
              ))}
            </ul>
          )}
          {search.trim().length >= 3 && matches.length === 0 && <p className="muted small">Nenhum cliente encontrado. Preencha os dados abaixo para cadastrar um novo.</p>}

          <div className="bal-step">
            {stepHead(1, 'Cliente', clientDone, `${form.name} · ${form.phone}`)}
            {known && <p className="pill green">Cliente já cadastrado</p>}
            <div className="form-grid">
              <label className="field">Nome<input value={form.name} onChange={set('name')} /></label>
              <label className="field">Telefone<input value={form.phone} onChange={set('phone')} inputMode="tel" /></label>
            </div>
          </div>

          <div className="bal-step">
            {stepHead(2, 'Endereço', addressDone, `${form.street}, ${form.number} — ${form.neighborhood}`)}
            {known && addressDone && !editAddress ? (
              <div className="bal-address">
                <span>{form.street}, {form.number}{form.complement ? ` · ${form.complement}` : ''} — {form.neighborhood}</span>
                <button type="button" className="link" onClick={() => setEditAddress(true)}>Alterar endereço</button>
              </div>
            ) : (
              <div className="form-grid">
                <label className="field">Bairro
                  <select value={form.neighborhood} onChange={set('neighborhood')}>
                    <option value="">Selecione</option>
                    {data.neighborhoods.map((n) => <option key={n.name} value={n.name}>{n.name} · {n.zone}</option>)}
                  </select>
                </label>
                <label className="field">Rua<input value={form.street} onChange={set('street')} /></label>
                <label className="field">Número<input value={form.number} onChange={set('number')} /></label>
                <label className="field">Complemento<input value={form.complement} onChange={set('complement')} /></label>
                <label className="field wide">Ponto de referência<input value={form.reference} onChange={set('reference')} /></label>
              </div>
            )}
          </div>

          <div className="bal-step">
            {stepHead(3, 'Entrega', !!form.window, form.window)}
            <div className="form-grid">
              <label className="field">Janela de entrega
                <select value={form.window} onChange={set('window')}>{DELIVERY_WINDOWS.map((w) => <option key={w}>{w}</option>)}</select>
              </label>
              <label className="field wide">Observações<textarea rows={2} value={form.notes} onChange={set('notes')} /></label>
            </div>
            <label className="check"><input type="checkbox" checked={form.consent} onChange={set('consent')} /> O cliente aceita receber avisos por WhatsApp</label>
          </div>

          {error && <p className="error" role="alert">{error}</p>}
          <div className="bar"><button type="button" className="primary" onClick={() => void submit()}>Cadastrar e identificar caixas</button></div>
          <p className="muted small">Os dados digitados ficam salvos como rascunho neste navegador.</p>
        </section>

        <aside className="card bal-queue" aria-label="Fila do dia">
          <div className="card-head"><h2>Aguardando caixas</h2><span className="pill blue">{awaiting.length}</span></div>
          {awaiting.length === 0 ? <p className="muted small">Nenhuma compra esperando caixas.</p> : awaiting.slice(0, 6).map(orderLine)}
          <div className="card-head bal-recent"><h2>Recentes</h2><button type="button" className="link" onClick={() => setColumns(true)}>Ver em colunas</button></div>
          {recent.map(orderLine)}
          <div className="bal-links"><Link to="/pendencias">Continuar atendimento</Link><Link to="ficha">Ficha de papel</Link><Link to="/entregas">Consultar entregas</Link></div>
        </aside>
      </div>

      {columns && (
        <Modal title="Fila do atendimento" width={1040} onClose={() => setColumns(false)}>
          <div className="bal-cols">
            {columnsData.map(([title, list]) => (
              <section key={title}>
                <div className="card-head"><h3>{title}</h3><span className="pill gray">{list.length}</span></div>
                {list.slice(0, 8).map((o) => (
                  <div className="bal-kcard" key={`${title}-${o.id}`}>
                    <strong>{o.name}</strong>
                    <span className="muted small">{o.id ? `#${o.id} · ` : ''}{o.neighborhood}</span>
                    {o.id ? <OrderPill status={o.status} /> : <span className="pill gray">Rascunho</span>}
                  </div>
                ))}
                {list.length > 8 && <p className="muted small">+ {list.length - 8} na lista de entregas</p>}
                {list.length === 0 && <p className="muted small">Nada por aqui.</p>}
              </section>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

let uid = 0;
interface Row extends BoxInput { key: number }

function IdentificarCaixas() {
  const { orderId } = useParams();
  const { data, saveBoxes } = useStore();
  const navigate = useNavigate();
  const order = data.orders.find((o) => o.id === Number(orderId));

  // caixa em uso = em outra entrega que ainda não terminou (regra do domínio, a mesma da API)
  const taken = useMemo(() => new Set(boxesInUse(data, order?.id).keys()), [data, order?.id]);
  const nextCode = (used: string[]) => {
    const max = Math.max(900, ...[...taken, ...used].map((c) => Number(c.replace(/\D/g, '')) || 0));
    return `CX-${max + 1}`;
  };

  const [rows, setRows] = useState<Row[]>(() => (order?.boxes ?? []).map((code) => ({
    key: ++uid, code, type: order?.boxDetails?.[code]?.type ?? 'ambient', location: order?.boxDetails?.[code]?.location ?? DEFAULT_BOX_LOCATION.ambient,
  })));
  const [gas, setGas] = useState(order?.gas ?? 0);
  const [error, setError] = useState('');

  if (!order) return <><Header title="Entrega não encontrada" /><Empty><Link to="/atendimento">Voltar ao atendimento</Link></Empty></>;

  const add = () => setRows((r) => [...r, { key: ++uid, code: nextCode(r.map((x) => x.code)), type: 'ambient', location: DEFAULT_BOX_LOCATION.ambient }]);
  const update = (key: number, patch: Partial<BoxInput>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const changeType = (key: number, type: BoxType) => update(key, { type, location: DEFAULT_BOX_LOCATION[type] });

  const finish = (withBoxes: boolean) => {
    const boxes = withBoxes ? rows.map(({ key: _k, ...b }) => ({ ...b, code: b.code.trim().toUpperCase() })) : [];
    const codes = boxes.map((b) => b.code);
    if (boxes.some((b) => !b.code)) { setError('Informe o código de todas as caixas.'); return; }
    if (new Set(codes).size !== codes.length) { setError('Há códigos de caixa repetidos nesta entrega.'); return; }
    const dup = codes.find((c) => taken.has(c));
    if (dup) { setError(`A caixa ${dup} já está vinculada a outra entrega.`); return; }
    if (boxes.some((b) => b.type !== 'ambient' && !b.location.trim())) { setError('Informe a câmara e a posição das caixas do frio.'); return; }
    setError('');
    const failed = saveBoxes(order.id, boxes, gas);
    if (failed) { setError(failed); return; }
    navigate(`/atendimento/concluido/${order.id}`);
  };

  return (
    <>
      <Header title="Identificar caixas" subtitle="Uma linha por caixa, inclusive a que está no frio."
        actions={<Link className="btn" to="/pendencias">Voltar</Link>} />
      <Steps current={2} />
      <section className="card">
        <div className="card-head"><h2>#{order.id} · {order.name}</h2><span className="muted">{order.street}, {order.number} — {order.neighborhood}</span></div>
        {rows.length === 0 && <Empty>Nenhuma caixa adicionada ainda.</Empty>}
        {rows.map((r, i) => (
          <div className="box-row" key={r.key}>
            <span className="muted">{i + 1}</span>
            <input aria-label="Código da caixa" value={r.code} onChange={(e) => update(r.key, { code: e.target.value })} />
            <select aria-label="Tipo" value={r.type} onChange={(e) => changeType(r.key, e.target.value as BoxType)}>
              {(Object.keys(BOX_TYPE_LABELS) as BoxType[]).map((t) => <option key={t} value={t}>{BOX_TYPE_LABELS[t]}</option>)}
            </select>
            <input aria-label="Local" value={r.location} onChange={(e) => update(r.key, { location: e.target.value })} />
            <button type="button" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} aria-label="Remover caixa">✕</button>
          </div>
        ))}
        <div className="bar">
          <button type="button" onClick={add}>+ Adicionar caixa</button>
          <label className="field inline">Itens fora das caixas (gás, etc.)
            <input type="number" min={0} value={gas} onChange={(e) => setGas(Math.max(0, Number(e.target.value) || 0))} />
          </label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="bar">
          <button type="button" className="primary" disabled={rows.length === 0} onClick={() => finish(true)}>Concluir atendimento</button>
          <button type="button" onClick={() => finish(false)}>Identificar depois</button>
        </div>
      </section>
    </>
  );
}

function Concluido() {
  const { orderId } = useParams();
  const { data } = useStore();
  const o = data.orders.find((x) => x.id === Number(orderId));
  if (!o) return <Navigate to="/atendimento" replace />;
  const ready = o.status === 'ready';
  return (
    <>
      <Steps current={3} />
      <section className="card done">
        <span className="eyebrow">#{o.id}</span>
        <h1>{ready ? 'Pronta para a expedição.' : 'Entrega cadastrada.'}</h1>
        <p className="muted">{ready ? 'A expedição já encontra esta compra para montar a carga.' : 'As caixas ainda não foram identificadas. Retome em "Continuar atendimento".'}</p>
        <p><strong>{o.name}</strong> · {o.street}, {o.number} — {o.neighborhood}</p>
        <p>{o.boxes.length} caixa(s){o.cold ? ` · ${o.cold} no frio` : ''}{o.frozen ? ` · ${o.frozen} congelada(s)` : ''} · <OrderPill status={o.status} /></p>
        <div className="actions">
          <Link className="btn primary" to="/atendimento/nova">Nova entrega</Link>
          <Link className="btn" to="/pendencias">Continuar atendimento</Link>
        </div>
      </section>
    </>
  );
}
