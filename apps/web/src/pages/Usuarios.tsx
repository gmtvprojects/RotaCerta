import { useCallback, useEffect, useState } from 'react';
import { ROLE_LABELS, type Role } from '@rotacerta/domain';
import { call } from '../app/api';
import { useStore } from '../app/store';
import { Modal } from './ui';

interface UserDto { id: number; name: string; email: string; role: Role; driverId: number | null; active: boolean }
interface AuditRow { id: number; at: string; userName: string | null; action: string; target: string | null; status: number | null; detail: Record<string, unknown> | null; ip: string | null }

const ROLES: Role[] = ['gestao', 'atendente', 'expedicao', 'motorista'];
const message = (e: unknown) => (e instanceof Error ? e.message : 'Não foi possível concluir a operação.');

/** Acesso da equipe: quem entra no sistema, com qual perfil. Só a gestão chega aqui. */
export function Usuarios() {
  const { data, user: me } = useStore();
  const [users, setUsers] = useState<UserDto[]>([]);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ kind: 'edit'; user?: UserDto } | { kind: 'password'; user: UserDto } | null>(null);

  const load = useCallback(() => call<UserDto[]>('GET', '/users').then(setUsers).catch((e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (u: UserDto) => {
    setError('');
    try { await call('PATCH', `/users/${u.id}`, { active: !u.active }); await load(); } catch (e) { setError(message(e)); }
  };

  return (
    <section className="card">
      <div className="card-head"><h2>Usuários e acesso</h2><button type="button" className="primary" onClick={() => setDialog({ kind: 'edit' })}>+ Usuário</button></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Motorista</th><th>Situação</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}{u.id === me?.sub && <span className="muted small"> (você)</span>}</td>
                <td>{u.email}</td>
                <td>{ROLE_LABELS[u.role]}</td>
                <td>{data.drivers.find((d) => d.id === u.driverId)?.name ?? '—'}</td>
                <td><span className={`pill ${u.active ? 'green' : 'amber'}`}>{u.active ? 'Ativo' : 'Desativado'}</span></td>
                <td className="actions">
                  <button type="button" onClick={() => setDialog({ kind: 'edit', user: u })}>Editar</button>
                  <button type="button" onClick={() => setDialog({ kind: 'password', user: u })}>Nova senha</button>
                  <button type="button" onClick={() => void toggle(u)}>{u.active ? 'Desativar' : 'Reativar'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Desativar ou trocar a senha encerra as sessões da pessoa. O sistema sempre mantém ao menos um usuário ativo na gestão.</p>
      {dialog?.kind === 'edit' && <UserDialog user={dialog.user} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void load(); }} />}
      {dialog?.kind === 'password' && <PasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
    </section>
  );
}

function UserDialog({ user, onClose, onSaved }: { user?: UserDto; onClose: () => void; onSaved: () => void }) {
  const { data } = useStore();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(user?.role ?? 'atendente');
  const [driverId, setDriverId] = useState<number | null>(user?.driverId ?? null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError(''); setBusy(true);
    const link = role === 'motorista' ? driverId : null;
    try {
      if (user) await call('PATCH', `/users/${user.id}`, { name, role, driverId: link });
      else await call('POST', '/users', { name, email, password, role, driverId: link });
      onSaved();
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  };

  return (
    <Modal title={user ? 'Editar usuário' : 'Novo usuário'} onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Cancelar</button>
      <button type="button" className="primary" disabled={busy} onClick={() => void save()}>Salvar</button>
    </>}>
      <label className="field">Nome completo<input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
      {!user && <>
        <label className="field">E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Senha inicial (mínimo 10 caracteres)<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      </>}
      <label className="field">Perfil
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select>
      </label>
      {role === 'motorista' && (
        <label className="field">Cadastro de motorista
          <select value={driverId ?? ''} onChange={(e) => setDriverId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Selecione</option>
            {data.drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  );
}

function PasswordDialog({ user, onClose }: { user: UserDto; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const save = async () => {
    setError('');
    try { await call('POST', `/users/${user.id}/password`, { password }); setDone(true); } catch (e) { setError(message(e)); }
  };

  return (
    <Modal title={`Nova senha para ${user.name}`} onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>{done ? 'Fechar' : 'Cancelar'}</button>
      {!done && <button type="button" className="primary" onClick={() => void save()}>Redefinir</button>}
    </>}>
      {done ? <p>Senha redefinida. A pessoa foi desconectada e entra com a nova senha.</p> : <>
        <label className="field">Nova senha (mínimo 10 caracteres)<input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></label>
        {error && <p className="error" role="alert">{error}</p>}
      </>}
    </Modal>
  );
}

/** Trilha de auditoria: quem fez o quê e quando (mais recentes primeiro). */
export function Auditoria() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState('');
  const load = useCallback(() => call<AuditRow[]>('GET', '/audit?limit=100').then(setRows).catch((e) => setError(message(e))), []);
  useEffect(() => { void load(); }, [load]);

  return (
    <section className="card">
      <div className="card-head"><h2>Auditoria</h2><button type="button" onClick={() => void load()}>Atualizar</button></div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Resultado</th><th>IP</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.at).toLocaleString('pt-BR')}</td>
                <td>{r.userName ?? '—'}</td>
                <td>{r.action}{r.target && r.target !== '{}' ? <span className="muted small"> {r.target}</span> : null}</td>
                <td><span className={`pill ${r.status && r.status >= 400 ? 'amber' : 'green'}`}>{r.status ?? '—'}</span></td>
                <td className="muted small">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Registra entradas, alterações e ações bloqueadas. Senhas e conteúdos digitados nunca são guardados.</p>
    </section>
  );
}
