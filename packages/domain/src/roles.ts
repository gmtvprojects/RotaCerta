export type Role = 'gestao' | 'atendente' | 'expedicao' | 'motorista';

export type Page =
  | 'dashboard' | 'atendimento' | 'pendencias' | 'cadastro-concluido' | 'perfis'
  | 'entregas' | 'nova' | 'volumes' | 'expedicao' | 'planejamento' | 'romaneio'
  | 'carregamento' | 'motorista' | 'notificacoes' | 'configuracoes';

/** Páginas permitidas por perfil (derivado do demo de referência). */
export const ALLOWED_PAGES: Record<Role, readonly Page[]> = {
  gestao: [
    'dashboard', 'atendimento', 'pendencias', 'cadastro-concluido', 'perfis',
    'entregas', 'nova', 'volumes', 'expedicao', 'planejamento', 'romaneio',
    'carregamento', 'motorista', 'notificacoes', 'configuracoes',
  ],
  atendente: ['atendimento', 'pendencias', 'cadastro-concluido', 'perfis', 'entregas', 'nova', 'volumes'],
  expedicao: ['perfis', 'entregas', 'nova', 'volumes', 'expedicao', 'planejamento', 'romaneio', 'carregamento'],
  motorista: ['perfis', 'motorista', 'romaneio'],
};

export const ROLE_HOME: Record<Role, Page> = {
  gestao: 'dashboard',
  atendente: 'atendimento',
  expedicao: 'expedicao',
  motorista: 'motorista',
};

export const canAccess = (role: Role, page: Page): boolean => ALLOWED_PAGES[role].includes(page);
