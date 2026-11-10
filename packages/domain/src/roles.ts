/** Perfis de quem trabalha dentro de uma empresa. */
export type Role = 'gestao' | 'atendente' | 'expedicao' | 'motorista';

/** Perfil de quem opera o serviço (cadastra empresas e acessos). Não pertence a nenhuma empresa e não vê dados da operação. */
export type PlatformRole = 'plataforma';

/** Qualquer perfil que pode existir em um login. */
export type AnyRole = Role | PlatformRole;

export const isCompanyRole = (role: AnyRole): role is Role => role !== 'plataforma';

export type Page =
  | 'dashboard' | 'atendimento' | 'pendencias' | 'cadastro-concluido' | 'perfis'
  | 'entregas' | 'nova' | 'volumes' | 'expedicao' | 'planejamento' | 'romaneio'
  | 'carregamento' | 'motorista' | 'acompanhamento' | 'clientes' | 'notificacoes' | 'configuracoes';

/** Páginas permitidas por perfil (derivado do demo de referência). */
export const ALLOWED_PAGES: Record<Role, readonly Page[]> = {
  gestao: [
    'dashboard', 'atendimento', 'pendencias', 'cadastro-concluido', 'perfis',
    'entregas', 'nova', 'volumes', 'expedicao', 'planejamento', 'romaneio',
    'carregamento', 'motorista', 'acompanhamento', 'clientes', 'notificacoes', 'configuracoes',
  ],
  atendente: ['atendimento', 'pendencias', 'cadastro-concluido', 'perfis', 'entregas', 'nova', 'volumes', 'clientes'],
  expedicao: ['perfis', 'entregas', 'nova', 'volumes', 'expedicao', 'planejamento', 'romaneio', 'carregamento', 'acompanhamento'],
  motorista: ['perfis', 'motorista', 'romaneio'],
};

export const ROLE_HOME: Record<Role, Page> = {
  gestao: 'dashboard',
  atendente: 'atendimento',
  expedicao: 'expedicao',
  motorista: 'motorista',
};

export const canAccess = (role: Role, page: Page): boolean => ALLOWED_PAGES[role].includes(page);
