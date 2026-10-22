import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  BOX_TYPE_LABELS, DEFAULT_BOX_LOCATION, DELIVERY_WINDOWS, EMPTY_DELIVERY_FORM,
  type BoxInput, type BoxType, type DeliveryForm,
} from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header, OrderPill } from './ui';
import { FichaInicio, FichaModelo, FichaRevisao } from './FichaPapel';

export function Atendimento() {
  return (
    <Routes>
      <Route index element={<Inicio />} />
      <Route path="nova" element={<NovaEntrega />} />
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

function Inicio() {
  const { data, draft } = useStore();
  const awaiting = data.orders.filter((o) => o.status === 'awaiting').length;
  return (
    <>
      <Header title="Atendimento." subtitle="Escolha o próximo passo." />
      <div className="tiles">
        <Link className="tile primary" to="nova"><strong>Nova entrega</strong><span>Cadastre o cliente e o endereço.</span></Link>
        <Link className="tile" to="/pendencias">
          <strong>Continuar atendimento</strong>
          <span>{awaiting} compra(s) aguardando caixas{draft ? ' · 1 rascunho' : ''}</span>
        </Link>
        <Link className="tile" to="ficha"><strong>Ficha de papel</strong><span>Fotografe a ficha, revise e crie a entrega.</span></Link>
        <Link className="tile" to="/entregas"><strong>Consultar entregas</strong><span>Encontre uma compra pelo cliente ou pelo código.</span></Link>
      </div>
    </>
  );
}

const digits = (v: string) => v.replace(/\D/g, '');

function NovaEntrega() {
  const { data, draft, saveDraft, createOrder } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState<DeliveryForm>(draft ?? EMPTY_DELIVERY_FORM);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

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
  };

  const submit = () => {
    const missing = (['name', 'phone', 'neighborhood', 'street', 'number'] as const).filter((k) => !form[k].trim());
    if (missing.length) { setError('Preencha nome, telefone, bairro, rua e número.'); return; }
    setError('');
    const id = createOrder(form);
    saveDraft(null);
    navigate(`/atendimento/caixas/${id}`);
  };

  const discard = () => { setForm(EMPTY_DELIVERY_FORM); saveDraft(null); };

  return (
    <>
      <Header title="Nova entrega." subtitle="Identifique o cliente, confirme o endereço e cadastre."
        actions={touched && <button type="button" onClick={discard}>Descartar rascunho</button>} />
      <Steps current={1} />
      <section className="card">
        <h2>Quem vai receber?</h2>
        <label className="field">Buscar cliente por telefone ou nome
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ex.: 00101 ou Maria" />
        </label>
        {matches.length > 0 && (
          <ul className="suggest">
            {matches.map((c) => (
              <li key={c.id}><button type="button" onClick={() => pick(c.id)}>
                <strong>{c.name}</strong> <span className="muted">{c.phone} · {c.street}, {c.number} — {c.neighborhood}</span>
              </button></li>
            ))}
          </ul>
        )}
        {form.clientId != null && <p className="pill green">Cliente já cadastrado</p>}
        <div className="form-grid">
          <label className="field">Nome<input value={form.name} onChange={set('name')} /></label>
          <label className="field">Telefone<input value={form.phone} onChange={set('phone')} inputMode="tel" /></label>
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
          <label className="field">Janela de entrega
            <select value={form.window} onChange={set('window')}>
              {DELIVERY_WINDOWS.map((w) => <option key={w}>{w}</option>)}
            </select>
          </label>
          <label className="field wide">Observações<textarea rows={2} value={form.notes} onChange={set('notes')} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={form.consent} onChange={set('consent')} /> O cliente aceita receber avisos por WhatsApp</label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="bar"><button type="button" className="primary" onClick={submit}>Cadastrar e identificar caixas</button></div>
        <p className="muted small">Os dados digitados ficam salvos como rascunho neste navegador.</p>
      </section>
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

  const taken = useMemo(() => new Set(data.orders.filter((o) => o.id !== order?.id).flatMap((o) => o.boxes)), [data.orders, order?.id]);
  const nextCode = (used: string[]) => {
    const max = Math.max(900, ...[...taken, ...used].map((c) => Number(c.replace(/\D/g, '')) || 0));
    return `CX-${max + 1}`;
  };

  const [rows, setRows] = useState<Row[]>(() => (order?.boxes ?? []).map((code) => ({
    key: ++uid, code, type: order?.boxDetails?.[code]?.type ?? 'ambient', location: order?.boxDetails?.[code]?.location ?? DEFAULT_BOX_LOCATION.ambient,
  })));
  const [gas, setGas] = useState(order?.gas ?? 0);
  const [error, setError] = useState('');

  if (!order) return <><Header title="Entrega não encontrada." /><Empty><Link to="/atendimento">Voltar ao atendimento</Link></Empty></>;

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
    saveBoxes(order.id, boxes, gas);
    navigate(`/atendimento/concluido/${order.id}`);
  };

  return (
    <>
      <Header title="Identificar caixas." subtitle="Uma linha por caixa, inclusive a que está no frio."
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
