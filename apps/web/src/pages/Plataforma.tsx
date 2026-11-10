import { useCallback, useEffect, useState } from 'react';
import type { AnyRole } from '@rotacerta/domain';
import { call } from '../app/api';
import { Icon, Logo, type IconName } from '../app/icons';
import { useStore } from '../app/store';
import { Empty, Header, Modal } from './ui';

interface CompanyRow { id: number; name: string; active: boolean; createdAt: string; users: number; activeUsers: number; lastLogin: string | null }
interface CompanyDetail { id: number; name: string; active: boolean; createdAt: string; usage: { orders: number; clients: number; vehicles: number; drivers: number; routes: number } }
interface UserRow { id: number; name: string; email: string; role: AnyRole; roleLabel: string; active: boolean; company?: string | null; companyId?: number | null }
interface AuditRow { id: number; at: string; companyId: number | null; userName: string | null; action: string; target: string | null; status: number | null }

const message = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir a operação.');
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

/** Sem caracteres que se confundem (0/O, 1/l/I): a senha é lida e digitada por uma pessoa. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
function generatePassword(length = 14) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (v) => ALPHABET[v % ALPHABET.length]).join('');
}

type Tab = 'empresas' | 'usuarios' | 'auditoria';

/** Painel de quem opera o serviço: empresas, acessos, senhas e auditoria. Não mostra dados da operação das empresas. */
export function PlatformApp() {
  const { user, logout } = useStore();
  const [tab, setTab] = useState<Tab>('empresas');
  return (
    <div className="shell">
      <header className="topbar">
        <Logo sub="Plataforma" />
        <span className="grow" />
        <span className="role-tag">{user?.name}</span>
        <button type="button" onClick={logout}>Sair</button>
      </header>
      <main className="main">
        {tab === 'empresas' && <Empresas />}
        {tab === 'usuarios' && <BuscaUsuarios />}
        {tab === 'auditoria' && <Auditoria />}
      </main>
      <nav className="dock" aria-label="Menu da plataforma">
        {([['empresas', 'Empresas', 'building'], ['usuarios', 'Buscar usuário', 'search'], ['auditoria', 'Auditoria', 'shield']] as [Tab, string, IconName][]).map(([key, label, icon]) => (
          <button key={key} type="button" className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}><Icon name={icon} /><span>{label}</span></button>
        ))}
      </nav>
    </div>
  );
}

/* ---------- empresas ---------- */
function Empresas() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => call<CompanyRow[]>('GET', '/platform/companies').then((r) => { setCompanies(r); setError(''); }).catch((e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (c: CompanyRow) => {
    const verb = c.active ? 'Suspender' : 'Reativar';
    if (!confirm(c.active ? `${verb} ${c.name}? Ninguém da empresa conseguirá entrar e as sessões abertas serão encerradas. Os dados são mantidos.` : `${verb} ${c.name}?`)) return;
    try { await call('PATCH', `/platform/companies/${c.id}`, { active: !c.active }); await load(); } catch (e) { setError(message(e)); }
  };

  return (
    <>
      <Header title="Empresas." subtitle="Quem usa o serviço, quantos acessos tem e quando entrou pela última vez."
        actions={<button type="button" className="primary" onClick={() => setCreating(true)}>+ Nova empresa</button>} />
      {error && <p className="error" role="alert">{error}</p>}
      <section className="card">
        {companies.length === 0 ? <Empty>Nenhuma empresa cadastrada.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Empresa</th><th>Situação</th><th>Usuários ativos</th><th>Último acesso</th><th>Criada em</th><th></th></tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong></td>
                    <td><span className={`pill ${c.active ? 'green' : 'red'}`}>{c.active ? 'Ativa' : 'Suspensa'}</span></td>
                    <td>{c.activeUsers} de {c.users}</td>
                    <td>{when(c.lastLogin)}</td>
                    <td>{new Date(c.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td><div className="actions">
                      <button type="button" onClick={() => setOpen(c.id)}>Abrir</button>
                      <button type="button" className={c.active ? 'danger' : ''} onClick={() => void toggle(c)}>{c.active ? 'Suspender' : 'Reativar'}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {creating && <NewCompany onClose={() => setCreating(false)} onCreated={() => { setCreating(false); void load(); }} />}
      {open !== null && <CompanyDialog id={open} onClose={() => { setOpen(null); void load(); }} />}
    </>
  );
}

function NewCompany({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ company: string; email: string; password: string } | null>(null);

  const save = async () => {
    setError(''); setBusy(true);
    try {
      await call('POST', '/platform/companies', { name, manager: { name: managerName, email, password } });
      setDone({ company: name, email, password });
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Modal title="Empresa criada" onClose={onCreated} footer={<button type="button" className="primary" onClick={onCreated}>Concluir</button>}>
        <p><strong>{done.company}</strong> já pode entrar. Envie o acesso ao responsável por um canal privado:</p>
        <CopyBox text={`E-mail: ${done.email}\nSenha provisória: ${done.password}`} />
        <p className="muted small">Esta senha só aparece agora. No primeiro acesso a pessoa será obrigada a criar a dela.</p>
      </Modal>
    );
  }
  return (
    <Modal title="Nova empresa" onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Cancelar</button>
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>Criar empresa</button>
    </>}>
      <label className="field">Nome da empresa<input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <p className="muted small">Responsável (primeiro usuário, com perfil de gestão):</p>
      <label className="field">Nome<input value={managerName} onChange={(e) => setManagerName(e.target.value)} /></label>
      <label className="field">E-mail (será o login)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field">Senha provisória
        <input value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button type="button" onClick={() => setPassword(generatePassword())}>Gerar outra senha</button>
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  );
}

function CompanyDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [adding, setAdding] = useState(false);
  const [temp, setTemp] = useState<{ user: UserRow; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, u] = await Promise.all([call<CompanyDetail>('GET', `/platform/companies/${id}`), call<UserRow[]>('GET', `/platform/companies/${id}/users`)]);
      setDetail(d); setName(d.name); setUsers(u);
    } catch (e) { setError(message(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const rename = async () => {
    setError(''); setInfo('');
    try { await call('PATCH', `/platform/companies/${id}`, { name }); setInfo('Nome atualizado.'); await load(); } catch (e) { setError(message(e)); }
  };

  if (!detail) return <Modal title="Empresa" onClose={onClose}>{error ? <p className="error" role="alert">{error}</p> : <p className="muted">Carregando…</p>}</Modal>;

  return (
    <Modal title={detail.name} onClose={onClose} footer={<button type="button" onClick={onClose}>Fechar</button>}>
      <div>
        <small className="muted">Uso (somente contagens; o conteúdo da operação não é exibido)</small>
        <div className="chips" style={{ marginTop: 6 }}>
          <span className="pill blue">{detail.usage.orders} entregas</span>
          <span className="pill blue">{detail.usage.clients} clientes</span>
          <span className="pill blue">{detail.usage.routes} viagens</span>
          <span className="pill blue">{detail.usage.vehicles} veículos</span>
          <span className="pill blue">{detail.usage.drivers} motoristas</span>
        </div>
      </div>
      <label className="field">Nome da empresa<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      {name.trim() !== detail.name && <button type="button" onClick={() => void rename()}>Salvar nome</button>}
      {error && <p className="error" role="alert">{error}</p>}
      {info && <p className="muted" role="status">{info}</p>}

      <div className="card-head" style={{ marginTop: 14 }}><h3>Acessos</h3><button type="button" onClick={() => setAdding(true)}>+ Usuário</button></div>
      <UserList users={users} onChanged={load} onTemp={(user, password) => setTemp({ user, password })} onError={setError} />
      {adding && <AddUser companyId={id} onClose={() => setAdding(false)} onCreated={() => { setAdding(false); void load(); }} />}
      {temp && <TempPassword user={temp.user} password={temp.password} onClose={() => setTemp(null)} />}
    </Modal>
  );
}

function UserList({ users, onChanged, onTemp, onError }: { users: UserRow[]; onChanged: () => void; onTemp: (u: UserRow, password: string) => void; onError: (m: string) => void }) {
  const toggle = async (u: UserRow) => {
    if (u.active && !confirm(`Desativar ${u.name}? A pessoa será desconectada e não conseguirá entrar.`)) return;
    try { await call('PATCH', `/platform/users/${u.id}`, { active: !u.active }); onChanged(); } catch (e) { onError(message(e)); }
  };
  const reset = async (u: UserRow) => {
    if (!confirm(`Gerar uma senha provisória para ${u.name}? A senha atual deixa de valer e as sessões abertas são encerradas.`)) return;
    try { const { password } = await call<{ password: string }>('POST', `/platform/users/${u.id}/reset-password`); onTemp(u, password); onChanged(); } catch (e) { onError(message(e)); }
  };
  if (!users.length) return <Empty>Nenhum usuário.</Empty>;
  return (
    <>
      {users.map((u) => (
        <div className="row-item" key={u.id}>
          <div>
            <strong>{u.name}</strong> <span className="pill">{u.roleLabel}</span> {!u.active && <span className="pill red">Inativo</span>}
            <div className="muted small">{u.email}{u.company ? ` · ${u.company}` : ''}</div>
          </div>
          <div className="actions">
            <button type="button" onClick={() => void reset(u)}>Redefinir senha</button>
            <button type="button" className={u.active ? 'danger' : ''} onClick={() => void toggle(u)}>{u.active ? 'Desativar' : 'Reativar'}</button>
          </div>
        </div>
      ))}
    </>
  );
}

function AddUser({ companyId, onClose, onCreated }: { companyId: number; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'gestao' | 'atendente' | 'expedicao'>('atendente');
  const [password, setPassword] = useState(() => generatePassword());
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const save = async () => {
    setError('');
    try { await call('POST', `/platform/companies/${companyId}/users`, { name, email, role, password }); setCreated(true); } catch (e) { setError(message(e)); }
  };
  if (created) {
    return (
      <Modal title="Usuário criado" onClose={onCreated} footer={<button type="button" className="primary" onClick={onCreated}>Concluir</button>}>
        <CopyBox text={`E-mail: ${email.toLowerCase()}\nSenha provisória: ${password}`} />
        <p className="muted small">Envie por um canal privado. A pessoa troca a senha no primeiro acesso. Motoristas são criados pela gestão da empresa, ligados ao cadastro de motorista.</p>
      </Modal>
    );
  }
  return (
    <Modal title="Novo usuário" onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Cancelar</button>
      <button type="button" className="primary" onClick={() => void save()}>Criar usuário</button>
    </>}>
      <label className="field">Nome<input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      <label className="field">E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="field">Perfil
        <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="gestao">Gestão</option><option value="atendente">Atendente</option><option value="expedicao">Expedição</option>
        </select>
      </label>
      <label className="field">Senha provisória<input value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button type="button" onClick={() => setPassword(generatePassword())}>Gerar outra senha</button>
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  );
}

function TempPassword({ user, password, onClose }: { user: UserRow; password: string; onClose: () => void }) {
  return (
    <Modal title="Senha provisória" onClose={onClose} footer={<button type="button" className="primary" onClick={onClose}>Fechar</button>}>
      <p>Nova senha de <strong>{user.name}</strong> ({user.email}):</p>
      <CopyBox text={password} />
      <p className="muted small">Ela só aparece agora e não fica registrada em lugar nenhum. A pessoa precisa trocá-la ao entrar.</p>
    </Modal>
  );
}

function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* sem permissão: a pessoa seleciona e copia à mão */ }
  };
  return (
    <div>
      <pre style={{ whiteSpace: 'pre-wrap', userSelect: 'all', padding: 12, borderRadius: 10, background: 'var(--line)', margin: '6px 0' }}>{text}</pre>
      <button type="button" onClick={() => void copy()}>{copied ? 'Copiado ✓' : 'Copiar'}</button>
    </div>
  );
}

/* ---------- busca de usuários (suporte) ---------- */
function BuscaUsuarios() {
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');
  const [temp, setTemp] = useState<{ user: UserRow; password: string } | null>(null);

  const load = useCallback(() => {
    if (q.trim().length < 2) { setUsers([]); return Promise.resolve(); }
    return call<UserRow[]>('GET', `/platform/users?q=${encodeURIComponent(q.trim())}`).then((r) => { setUsers(r); setError(''); }).catch((e) => setError(message(e)));
  }, [q]);
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);

  return (
    <>
      <Header title="Buscar usuário." subtitle="Encontre um acesso em qualquer empresa para redefinir a senha ou desativar." />
      <section className="card">
        <label className="field">Nome ou e-mail<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: maria ou @mercado.com" autoFocus /></label>
        {error && <p className="error" role="alert">{error}</p>}
        {q.trim().length >= 2 && users.length === 0 ? <Empty>Nenhum usuário encontrado.</Empty> : (
          <UserList users={users} onChanged={() => void load()} onTemp={(user, password) => setTemp({ user, password })} onError={setError} />
        )}
      </section>
      {temp && <TempPassword user={temp.user} password={temp.password} onClose={() => setTemp(null)} />}
    </>
  );
}

/* ---------- auditoria geral ---------- */
function Auditoria() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [action, setAction] = useState('');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const PAGE = 50;

  useEffect(() => { void call<CompanyRow[]>('GET', '/platform/companies').then(setCompanies).catch(() => undefined); }, []);

  const query = useCallback((before?: number) => {
    const p = new URLSearchParams({ limit: String(PAGE) });
    if (companyId) p.set('companyId', companyId);
    if (action.trim()) p.set('action', action.trim());
    if (before) p.set('before', String(before));
    return call<AuditRow[]>('GET', `/platform/audit?${p}`);
  }, [companyId, action]);

  useEffect(() => {
    const t = setTimeout(() => void query().then((r) => { setRows(r); setMore(r.length === PAGE); setError(''); }).catch((e) => setError(message(e))), 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadMore = () => void query(rows[rows.length - 1]?.id).then((r) => { setRows((cur) => [...cur, ...r]); setMore(r.length === PAGE); }).catch((e) => setError(message(e)));
  const nameOf = (id: number | null) => (id == null ? '—' : companies.find((c) => c.id === id)?.name ?? `#${id}`);

  return (
    <>
      <Header title="Auditoria." subtitle="Entradas, redefinições de senha e ações de todas as empresas." />
      <section className="card">
        <div className="actions" style={{ marginBottom: 12 }}>
          <label className="field">Empresa
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Todas</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">Ação começa com<input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Ex.: platform. ou auth." /></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        {rows.length === 0 ? <Empty>Nenhum registro.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Quando</th><th>Empresa</th><th>Quem</th><th>Ação</th><th>Alvo</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.at)}</td><td>{nameOf(r.companyId)}</td><td>{r.userName ?? '—'}</td><td>{r.action}</td><td>{r.target ?? ''}</td><td>{r.status ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {more && <div className="actions" style={{ marginTop: 12 }}><button type="button" onClick={loadMore}>Carregar mais</button></div>}
      </section>
    </>
  );
}
