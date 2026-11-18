import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, call } from '../app/api';
import { Icon } from '../app/icons';
import { Markdown } from './Markdown';

export interface ChatAgent { id: number; name: string; description: string; tools: string[] }
interface Step { tool: string; label: string; ok: boolean }
interface Msg { role: 'user' | 'assistant'; text: string; steps?: Step[]; failed?: boolean; at: string }

const MAX = 4000;
const storeKey = (id: number) => `rotacerta:agente:${id}`;
const loadChat = (id: number): Msg[] => {
  try { const raw = JSON.parse(sessionStorage.getItem(storeKey(id)) ?? '[]'); return Array.isArray(raw) ? raw : []; } catch { return []; }
};
const saveChat = (id: number, msgs: Msg[]) => {
  try { if (msgs.length) sessionStorage.setItem(storeKey(id), JSON.stringify(msgs.slice(-60))); else sessionStorage.removeItem(storeKey(id)); } catch { /* sem armazenamento */ }
};
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Perguntas de exemplo conforme as consultas liberadas para o agente. */
function examples(tools: string[]) {
  const all: Array<[string, string, string]> = [
    ['resumo_operacao', 'Resumo do dia', 'Como está a operação agora?'],
    ['buscar_entregas', 'Pendências', 'Quais entregas estão aguardando caixas?'],
    ['viagens_ao_vivo', 'Viagens', 'Onde estão os motoristas em rota e o que falta?'],
    ['listar_romaneios', 'Romaneios', 'Quais romaneios estão carregando ou liberados?'],
    ['detalhe_entrega', 'Uma entrega', 'O que aconteceu com a entrega 103?'],
    ['buscar_clientes', 'Clientes', 'Procure a cliente Maria e as entregas dela.'],
  ];
  return all.filter(([t]) => tools.includes(t)).slice(0, 4).map(([, title, q]) => ({ title, q }));
}

/**
 * Conversa com um agente. O histórico fica neste aparelho (aba do navegador) e vai junto em cada pergunta:
 * a API não guarda o texto. A caixa de texto fica fixa embaixo e a conversa rola acima dela.
 */
export function AgentChat({ agent, ready, toolLabel, onBack, onEdit, children }: {
  agent: ChatAgent; ready: boolean; toolLabel: (n: string) => string; onBack: () => void; onEdit?: () => void; children?: ReactNode;
}) {
  const [messages, setMessages] = useState<Msg[]>(() => loadChat(agent.id));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { saveChat(agent.id, messages); }, [agent.id, messages]);
  // sempre mostra a mensagem mais nova
  useLayoutEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  // caixa de texto cresce com o conteúdo (até ~6 linhas)
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [text]);
  useEffect(() => { input.current?.focus(); }, []);

  const ask = async (history: Msg[]) => {
    setBusy(true);
    try {
      // só as últimas trocas válidas vão para a IA (custo e tamanho sob controle)
      const payload = history.filter((m) => !m.failed).slice(-20).map(({ role, text: t }) => ({ role, text: t }));
      const res = await call<{ reply: string; steps: Step[] }>('POST', `/agents/${agent.id}/chat`, { messages: payload });
      setMessages((m) => [...m, { role: 'assistant', text: res.reply, steps: res.steps, at: new Date().toISOString() }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: e instanceof ApiError ? e.message : 'Não foi possível falar com o agente.', failed: true, at: new Date().toISOString() }]);
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  };

  const send = (question: string) => {
    const q = question.trim().slice(0, MAX);
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: 'user', text: q, at: new Date().toISOString() }];
    setMessages(next);
    setText('');
    void ask(next);
  };

  /** Tenta de novo a última pergunta que falhou. */
  const retry = () => {
    const withoutFail = messages.slice(0, -1);
    setMessages(withoutFail);
    void ask(withoutFail);
  };

  const copy = async (i: number, t: string) => {
    try { await navigator.clipboard.writeText(t); setCopied(i); setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500); } catch { /* sem permissão */ }
  };

  const reset = () => { if (!messages.length || confirm('Começar uma nova conversa? A atual será apagada deste aparelho.')) { setMessages([]); input.current?.focus(); } };
  const initial = agent.name.trim().charAt(0).toUpperCase() || 'A';
  const sugg = examples(agent.tools);

  return (
    <div className="ag-page">
      <header className="ag-top">
        <button type="button" className="ag-icon-btn" onClick={onBack} aria-label="Voltar para todos os agentes"><Icon name="arrow" size={18} /></button>
        <span className="ag-avatar" aria-hidden="true">{initial}</span>
        <div className="ag-title">
          <h1>{agent.name}</h1>
          <span className="muted small ag-desc">{agent.description || 'Agente de IA'}</span>
        </div>
        <span className="grow" />
        {messages.length > 0 && <button type="button" className="ag-ghost" onClick={reset} aria-label="Nova conversa"><Icon name="plus" size={16} /><span className="ag-label">Nova conversa</span></button>}
        {onEdit && <button type="button" className="ag-ghost" onClick={onEdit} aria-label="Editar agente"><Icon name="sliders" size={16} /><span className="ag-label">Editar</span></button>}
      </header>

      <section className="ag-chat" aria-label={`Conversa com ${agent.name}`}>
        <div className="ag-log" ref={log} aria-live="polite">
          <div className="ag-column">
            {!ready && <div className="banner info" role="status"><span>A IA não está ligada neste ambiente (falta <code>ANTHROPIC_API_KEY</code> na API).</span></div>}

            {messages.length === 0 && (
              <div className="ag-hello">
                <span className="ag-avatar lg" aria-hidden="true">{initial}</span>
                <h2>Como posso ajudar?</h2>
                <p className="muted">{agent.description || 'Pergunte em linguagem natural sobre a operação.'}</p>
                {agent.tools.length > 0 && <p className="muted small">Consulto: {agent.tools.map(toolLabel).join(' · ')}</p>}
                {sugg.length > 0 && (
                  <div className="ag-suggest">
                    {sugg.map((s) => (
                      <button type="button" key={s.q} className="ag-card" onClick={() => send(s.q)}>
                        <b>{s.title}</b><span>{s.q}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => m.role === 'user' ? (
              <div key={i} className="ag-row user">
                <div className="ag-bubble">{m.text}</div>
                <span className="ag-meta">{hhmm(m.at)}</span>
              </div>
            ) : (
              <div key={i} className={`ag-row assistant ${m.failed ? 'failed' : ''}`}>
                <span className="ag-avatar sm" aria-hidden="true">{initial}</span>
                <div className="ag-answer">
                  {m.steps && m.steps.length > 0 && (
                    <details className="ag-steps">
                      <summary><Icon name="search" size={14} /> Consultou {m.steps.length === 1 ? m.steps[0].label.toLowerCase() : `${m.steps.length} fontes`}</summary>
                      <ul>{m.steps.map((s, j) => <li key={j} className={s.ok ? '' : 'bad'}>{s.ok ? '✓' : '✕'} {s.label}</li>)}</ul>
                    </details>
                  )}
                  {m.failed ? <p className="ag-error">{m.text}</p> : <Markdown text={m.text} />}
                  <div className="ag-actions">
                    <span className="ag-meta">{hhmm(m.at)}</span>
                    {m.failed
                      ? i === messages.length - 1 && <button type="button" className="ag-ghost sm" onClick={retry} disabled={busy}>Tentar de novo</button>
                      : <button type="button" className="ag-ghost sm" onClick={() => void copy(i, m.text)}>{copied === i ? 'Copiado' : 'Copiar'}</button>}
                  </div>
                </div>
              </div>
            ))}

            {busy && (
              <div className="ag-row assistant">
                <span className="ag-avatar sm" aria-hidden="true">{initial}</span>
                <div className="ag-thinking" role="status"><span className="ag-dots"><i /><i /><i /></span>Consultando a operação…</div>
              </div>
            )}
          </div>
        </div>

        <form className="ag-composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
          <div className="ag-column">
            <div className="ag-box">
              <textarea ref={input} rows={1} value={text} maxLength={MAX} placeholder={`Pergunte ao ${agent.name}…`} aria-label="Sua pergunta"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(text); } }} />
              <button type="submit" className="ag-send" disabled={busy || !text.trim()} aria-label="Enviar pergunta"><Icon name="arrow" size={18} /></button>
            </div>
            <p className="ag-foot">
              <span className="ag-hint">Enter envia · Shift+Enter quebra a linha</span>
              {text.length > MAX - 500 && <span>{text.length}/{MAX}</span>}
              <span>Respostas de IA podem conter erros; confira dados importantes.</span>
            </p>
          </div>
        </form>
      </section>
      {children}
    </div>
  );
}
