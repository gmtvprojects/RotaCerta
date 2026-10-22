import { useRef, useState, type ChangeEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  BOX_TYPE_LABELS, DEFAULT_BOX_LOCATION, DELIVERY_WINDOWS, EXAMPLE_SHEET_NUMBER, MAX_PAPER_BOXES,
  blankPaperValues, examplePaperValues,
  type BoxType, type Neighborhood, type PaperForm, type PaperValues,
} from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header } from './ui';

const MAX_BYTES = 12 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Reduz a foto para caber no armazenamento local do navegador. */
function shrink(file: File, max = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível abrir a imagem.')); };
    img.src = url;
  });
}

const stateLabel = (p: PaperForm): [string, string] =>
  p.status === 'imported' ? ['Entrega criada', 'green'] : p.status === 'draft' ? ['Rascunho salvo', 'amber'] : ['Foto anexada', 'blue'];

const nextNumber = (papers: PaperForm[]) => {
  const max = Math.max(142, ...papers.map((p) => Number(p.sheetNumber.replace(/\D/g, '')) || 0));
  return `RC-${String(max + 1).padStart(6, '0')}`;
};

/* ---------- Lista / captura ---------- */

export function FichaInicio() {
  const { papers, addPaper, deletePaper } = useStore();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type)) { setError('Use uma foto JPG, PNG ou WebP.'); return; }
    if (file.size > MAX_BYTES) { setError('A foto passa de 12 MB. Escolha uma menor.'); return; }
    try {
      const photo = await shrink(file);
      const id = addPaper({ sheetNumber: nextNumber(papers), mode: 'photo', photo, photoName: file.name, values: blankPaperValues() });
      navigate(`/atendimento/ficha/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao ler a foto.');
    }
  };

  const useExample = () => {
    const id = addPaper({ sheetNumber: EXAMPLE_SHEET_NUMBER, mode: 'example', values: examplePaperValues() });
    navigate(`/atendimento/ficha/${id}`);
  };

  return (
    <>
      <Header title="Do papel para a mesma operação." subtitle="Fotografe a ficha, revise e crie a entrega."
        actions={<Link className="btn" to="/atendimento/modelo">Ficha padrão para imprimir</Link>} />
      <div className="steps-intro">
        {[['1', 'Preencha a ficha', 'Use o modelo padrão da loja.'], ['2', 'Fotografe', 'Inclua todos os campos na foto.'], ['3', 'Revise e confirme', 'Depois, siga para os volumes.']].map(([n, t, d]) => (
          <div key={n}><span className="num">{n}</span><div><strong>{t}</strong><div className="muted small">{d}</div></div></div>
        ))}
      </div>
      <section className="card drop">
        <h2>Adicione a foto do formulário</h2>
        <p className="muted">Use o celular para fotografar ou selecione uma foto já salva. O cadastro só será criado depois da sua revisão.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={onFile} aria-label="Foto da ficha" />
        <div className="actions" style={{ justifyContent: 'center' }}>
          <button type="button" className="primary" onClick={() => input.current?.click()}>Fotografar ou escolher foto</button>
          <button type="button" onClick={useExample}>Usar ficha de exemplo</button>
        </div>
        <p className="muted small">JPG, PNG ou WebP · até 12 MB · uma ficha por foto</p>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      <p className="notice"><strong>Leitura automática ainda não conectada.</strong> Fotos próprias abrem uma revisão em branco, para digitação manual. A ficha de exemplo simula a extração apenas com os dados conhecidos da RC-000142; nunca adivinha dados da sua imagem.</p>

      <section className="card">
        <h2>Fichas</h2>
        {papers.length === 0 ? <Empty>Nenhuma ficha ainda.</Empty> : papers.slice().reverse().map((p) => {
          const [label, tone] = stateLabel(p);
          return (
            <div className="row-item" key={p.id}>
              <div>
                <strong>{p.sheetNumber}</strong> <span className={`pill ${tone}`}>{label}</span>
                <div className="muted small">{p.values.name || 'Sem nome ainda'} · {new Date(p.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <span className="actions">
                <Link className="btn" to={`/atendimento/ficha/${p.id}`}>{p.status === 'imported' ? 'Ver ficha' : 'Continuar'}</Link>
                {p.status !== 'imported' && <button type="button" className="danger" onClick={() => { if (confirm('Excluir este rascunho de ficha?')) deletePaper(p.id); }}>Excluir</button>}
              </span>
            </div>
          );
        })}
      </section>
    </>
  );
}

/* ---------- Revisão ---------- */

export function FichaRevisao() {
  const { paperId } = useParams();
  const { papers, data, updatePaper, importPaper } = useStore();
  const navigate = useNavigate();
  const paper = papers.find((p) => p.id === paperId);
  const [values, setValues] = useState<PaperValues | null>(null);
  const [error, setError] = useState('');

  if (!paper) return <Navigate to="/atendimento/ficha" replace />;
  const v = values ?? paper.values;
  const imported = paper.status === 'imported';
  const order = imported ? data.orders.find((o) => o.id === paper.orderId) : undefined;

  const set = <K extends keyof PaperValues>(k: K, val: PaperValues[K]) => setValues({ ...v, [k]: val, ...(k === 'volumesReady' ? {} : { volumesReady: false }) });
  const text = (k: 'name' | 'phone' | 'street' | 'number' | 'complement' | 'reference' | 'notes') => ({
    value: v[k], onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, e.target.value),
  });
  const setBox = (i: number, patch: Partial<PaperValues['boxes'][number]>) => set('boxes', v.boxes.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const total = v.boxes.filter((b) => b.code.trim()).length + v.gas;

  const prepare = () => updatePaper(paper.id, { status: 'draft', values: paper.mode === 'example' ? examplePaperValues() : { ...blankPaperValues(paper.sheetNumber), sheetNumber: paper.sheetNumber } });
  const saveDraft = () => { updatePaper(paper.id, { values: v }); setValues(null); };

  const confirm = () => {
    const clean = v.boxes.map((b) => ({ ...b, code: b.code.trim().toUpperCase() }));
    const codes = clean.map((b) => b.code);
    const taken = new Set(data.orders.flatMap((o) => o.boxes));
    const missing = (['name', 'phone', 'neighborhood', 'street', 'number', 'window'] as const).filter((k) => !String(v[k]).trim());
    if (missing.length) return setError('Preencha nome, telefone, bairro, rua, número e horário.');
    if (clean.length === 0) return setError('Informe ao menos uma caixa.');
    if (codes.some((c) => !c)) return setError('Informe o código de todas as caixas ou remova as linhas vazias.');
    if (new Set(codes).size !== codes.length) return setError('Há códigos de caixa repetidos.');
    const dup = codes.find((c) => taken.has(c));
    if (dup) return setError(`A caixa ${dup} já está vinculada a outra entrega.`);
    if (clean.some((b) => b.type !== 'ambient' && !b.location.trim())) return setError('Informe a câmara e a posição das caixas do frio.');
    if (!v.volumesReady) return setError('Confirme que conferiu a identificação de todos os volumes.');
    setError('');
    const id = importPaper(paper.id, { ...v, boxes: clean });
    if (id != null) navigate(`/atendimento/concluido/${id}`);
  };

  const hood = data.neighborhoods;

  return (
    <>
      <Header title={imported ? 'Ficha digitalizada. Entrega conectada.' : paper.status === 'captured' ? 'Confira a ficha antes de continuar.' : 'Revisar dados da ficha.'}
        subtitle={imported ? 'Consulte o papel e o cadastro que ele originou.' : 'O cadastro só será criado depois da conferência do atendente.'}
        actions={<Link className="btn" to="/atendimento/ficha">Voltar para fichas</Link>} />
      <p className="notice"><strong>{paper.mode === 'example' ? 'Demonstração de leitura — dados de exemplo.' : 'Foto própria — sem leitura automática.'}</strong>{' '}
        {paper.mode === 'example' ? 'Os campos vêm do nosso exemplo, não de reconhecimento da imagem.' : 'A imagem é apenas anexada; os campos são digitados por você.'}</p>

      <div className="scan-layout">
        <aside className="card">
          <span className="pill blue">{paper.sheetNumber}</span>
          {paper.mode === 'photo' && paper.photo
            ? <img className="paper-photo" src={paper.photo} alt={`Foto da ficha ${paper.sheetNumber}`} />
            : <PaperSheet values={examplePaperValues()} neighborhoods={hood} example />}
        </aside>

        {imported ? (
          <section className="card">
            <h2>O papel entrou no mesmo fluxo.</h2>
            <div className="summary-line"><span>Número da ficha</span><strong>{paper.sheetNumber}</strong></div>
            <div className="summary-line"><span>Entrega</span><strong>#{paper.orderId} · {paper.values.name}</strong></div>
            <div className="summary-line"><span>Endereço</span><strong>{paper.values.street}, {paper.values.number} — {paper.values.neighborhood}</strong></div>
            <div className="summary-line"><span>Status atual</span><strong>{order ? order.status : '—'}</strong></div>
            <p className="muted small">A importação não dispara notificações. Uma nova leitura desta ficha não gera outra entrega.</p>
            <Link className="btn primary" to={`/atendimento/concluido/${paper.orderId}`}>Ver entrega</Link>
          </section>
        ) : paper.status === 'captured' ? (
          <section className="card">
            <span className="pill blue">Foto anexada</span>
            <h2>{paper.mode === 'example' ? 'Pronto para simular a leitura da ficha de exemplo.' : 'Foto anexada. Continue para digitar os dados.'}</h2>
            <p className="muted">{paper.mode === 'example'
              ? 'Ao continuar, você poderá conferir e editar cliente, endereço e cada caixa antes de criar a entrega.'
              : 'Telefone, endereço e caixas devem ser informados por você. A extração automática ainda precisa de integração.'}</p>
            <button type="button" className="primary" onClick={prepare}>{paper.mode === 'example' ? 'Simular leitura da ficha' : 'Continuar para revisão manual'}</button>
          </section>
        ) : (
          <section className="card">
            <h2>01 · Cliente e endereço</h2>
            <div className="form-grid">
              <label className="field">Nome *<input {...text('name')} /></label>
              <label className="field">Telefone *<input {...text('phone')} inputMode="tel" /></label>
              <label className="field wide">Bairro *
                <select value={v.neighborhood} onChange={(e) => set('neighborhood', e.target.value)}>
                  <option value="">Selecione um bairro cadastrado</option>
                  {hood.map((n) => <option key={n.name} value={n.name}>{n.name} · {n.zone}</option>)}
                </select>
              </label>
              <label className="field">Rua *<input {...text('street')} /></label>
              <label className="field">Número *<input {...text('number')} /></label>
              <label className="field">Complemento<input {...text('complement')} /></label>
              <label className="field">Referência<input {...text('reference')} /></label>
              <label className="field">Horário solicitado *
                <input list="paper-windows" value={v.window} onChange={(e) => set('window', e.target.value)} placeholder="Ex.: 14:00–16:00" />
                <datalist id="paper-windows">{[...DELIVERY_WINDOWS, 'Sem preferência'].map((w) => <option key={w} value={w} />)}</datalist>
              </label>
              <label className="field wide">Observações<textarea rows={2} {...text('notes')} /></label>
            </div>
            <label className="check"><input type="checkbox" checked={v.consent} onChange={(e) => set('consent', e.target.checked)} /> Autorizou avisos por WhatsApp</label>

            <h2 style={{ marginTop: 22 }}>02 · Caixas e localização do frio</h2>
            <p className="muted small">Cada código identifica uma caixa física. Não some os resfriados novamente como volume avulso.</p>
            {v.boxes.map((b, i) => (
              <div className="box-row" key={i}>
                <span className="muted">{i + 1}</span>
                <input aria-label="Código da caixa" value={b.code} onChange={(e) => setBox(i, { code: e.target.value })} />
                <select aria-label="Tipo" value={b.type} onChange={(e) => setBox(i, { type: e.target.value as BoxType, location: DEFAULT_BOX_LOCATION[e.target.value as BoxType] })}>
                  {(Object.keys(BOX_TYPE_LABELS) as BoxType[]).map((t) => <option key={t} value={t}>{BOX_TYPE_LABELS[t]}</option>)}
                </select>
                <input aria-label="Local" value={b.location} onChange={(e) => setBox(i, { location: e.target.value })} />
                <button type="button" aria-label="Remover caixa" onClick={() => set('boxes', v.boxes.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <div className="bar">
              <button type="button" disabled={v.boxes.length >= MAX_PAPER_BOXES}
                onClick={() => set('boxes', [...v.boxes, { code: '', type: 'ambient', location: DEFAULT_BOX_LOCATION.ambient }])}>+ Adicionar caixa</button>
              <label className="field inline">Gás (unidades)
                <input type="number" min={0} max={99} value={v.gas} onChange={(e) => set('gas', Math.max(0, Number(e.target.value) || 0))} />
              </label>
            </div>
            <p className="muted small"><strong>{total} volumes físicos</strong> · {v.boxes.filter((b) => b.code.trim()).length} caixas + {v.gas} de gás. O conteúdo frio não duplica a contagem.</p>
            <label className="check"><input type="checkbox" checked={v.volumesReady} onChange={(e) => set('volumesReady', e.target.checked)} /> Conferi a identificação de todos os volumes da compra.</label>
            {error && <p className="error" role="alert">{error}</p>}
            <div className="bar">
              <button type="button" className="primary" onClick={confirm}>Confirmar e criar entrega</button>
              <button type="button" onClick={saveDraft}>Salvar rascunho</button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

/* ---------- Modelo para imprimir ---------- */

export function FichaModelo() {
  const { papers, data } = useStore();
  const [number, setNumber] = useState(() => nextNumber(papers));
  return (
    <>
      <Header title="Uma ficha menor. O mesmo controle." subtitle="Formato de meia folha A4, para preencher à mão. Imprima uma via por compra."
        actions={<>
          <button type="button" onClick={() => setNumber(nextNumber([...papers, { sheetNumber: number } as PaperForm]))}>Nova ficha numerada</button>
          <button type="button" className="primary" onClick={() => window.print()}>Imprimir</button>
          <Link className="btn" to="/atendimento/ficha">Voltar</Link>
        </>} />
      <PaperSheet values={blankPaperValues(number)} neighborhoods={data.neighborhoods} blank />
    </>
  );
}

/* ---------- Ficha de papel (visual) ---------- */

function Box({ on, children }: { on: boolean; children: string }) {
  return <span className="pf-choice"><span className={`pf-checkbox ${on ? 'on' : ''}`} />{children}</span>;
}
function Cell({ label, value = '' }: { label: string; value?: string }) {
  return <div className="pf-cell"><small>{label}</small><span>{value}</span></div>;
}

function PaperSheet({ values: v, neighborhoods, blank, example }: { values: PaperValues; neighborhoods: Neighborhood[]; blank?: boolean; example?: boolean }) {
  const list = neighborhoods.map((n) => n.name).slice(0, 6);
  const filled = !blank;
  return (
    <article className="paper-sheet" aria-label={`Ficha de entrega ${v.sheetNumber}`}>
      <header>
        <div><strong>Rota Certa</strong><small> FICHA DE ENTREGA · Compra presencial</small></div>
        <div className="pf-number"><small>Nº DA FICHA · UMA POR COMPRA</small><strong>{v.sheetNumber || 'RC-__________'}</strong></div>
      </header>
      <p className="pf-note">{example ? 'EXEMPLO PREENCHIDO · DADOS E TELEFONE FICTÍCIOS · NÃO USAR EM ENTREGAS REAIS' : 'Use letra legível e caneta escura. Após o corte, fotografe uma ficha por vez. Revise os dados no aplicativo.'}</p>
      <div className="pf-row"><Cell label="LOJA / UNIDADE" value={example ? 'Amaro Supermercados · Loja 01' : ''} /><Cell label="DATA" value={example ? '13/10/2026' : '____/____/______'} /><Cell label="ATENDENTE" value={example ? 'Beatriz Alves' : ''} /></div>
      <div className="pf-row"><Cell label="NOME DO CLIENTE" value={v.name} /><Cell label="TELEFONE COM DDD" value={v.phone} /></div>
      <h4>01 · ENDEREÇO E RECEBIMENTO</h4>
      <div className="pf-line"><small>BAIRRO · MARQUE UMA OPÇÃO</small>{list.map((n) => <Box key={n} on={v.neighborhood === n}>{n}</Box>)}<Box on={!!v.neighborhood && !list.includes(v.neighborhood)}>Outro:</Box></div>
      <div className="pf-row"><Cell label="RUA / AVENIDA" value={v.street} /><Cell label="Nº OU S/N" value={v.number} /></div>
      <div className="pf-row"><Cell label="COMPLEMENTO" value={v.complement} /><Cell label="PONTO DE REFERÊNCIA" value={v.reference} /></div>
      <div className="pf-line"><small>HORÁRIO SOLICITADO</small><span>{v.window && v.window !== 'Sem preferência' ? v.window : 'De ___:___ a ___:___'}</span><Box on={v.window === 'Sem preferência'}>Sem preferência</Box></div>
      <div className="pf-line"><small>WHATSAPP: autorizou avisos desta entrega?</small><Box on={filled && v.consent}>Sim</Box><Box on={filled && !v.consent && !!v.name}>Não</Box></div>
      <Cell label="OBSERVAÇÕES" value={v.notes} />
      <h4>02 · CAIXAS E ARMAZENAMENTO <small>S = Secos · R = Resfriados · C = Congelados</small></h4>
      <table className="pf-boxes">
        <thead><tr><th>CÓDIGO DA CAIXA</th><th>CONTEÚDO · MARQUE</th><th>LOCAL DE ARMAZENAMENTO</th></tr></thead>
        <tbody>
          {Array.from({ length: 6 }, (_, i) => {
            const b = v.boxes[i];
            return <tr key={i}><td>{b?.code}</td><td><Box on={b?.type === 'ambient'}>S</Box><Box on={b?.type === 'cold'}>R</Box><Box on={b?.type === 'frozen'}>C</Box></td><td>{b?.location}</td></tr>;
          })}
        </tbody>
      </table>
      <p className="pf-note">Caixas: {filled ? v.boxes.length : '___'} · Gás: {filled ? v.gas : '___'} — uma caixa = um volume, mesmo contendo itens frios. Na caixa do frio, informe a câmara e a posição.</p>
      <div className="pf-line"><Box on={filled && !v.volumesReady && !!v.name}>Aguardando identificação dos volumes</Box><Box on={filled && v.volumesReady}>Identificação dos volumes conferida</Box></div>
      <p className="pf-note">Revise no aplicativo. Importar a ficha não libera a carga nem dispara avisos. · MEIA A4 · 1 ficha / compra</p>
    </article>
  );
}
