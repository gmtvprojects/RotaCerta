import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_LABELS, type Role } from '@rotacerta/domain';
import { useStore } from './store';

export interface TourStep { path: string; title: string; text: string }

/** Jornada de cada perfil, na ordem em que a operação acontece. */
export const TOURS: Record<Role, TourStep[]> = {
  atendente: [
    { path: '/atendimento', title: 'Comece pelo atendimento', text: 'Cadastro direto ou ficha em papel. Sem indicadores de gestão.' },
    { path: '/atendimento/nova', title: 'Identifique o cliente', text: 'Busque pelo telefone, confirme o endereço e cadastre.' },
    { path: '/atendimento/ficha', title: 'O papel é uma alternativa', text: 'Use a ficha de exemplo para demonstrar a leitura simulada e a revisão.' },
    { path: '/pendencias', title: 'Conclua o que ficou pendente', text: 'Identifique as caixas. A compra entra na fila da expedição após a confirmação.' },
  ],
  expedicao: [
    { path: '/expedicao', title: 'Monte a carga por bairro', text: 'A equipe mantém a decisão sobre quais compras vão juntas.' },
    { path: '/carregamento', title: 'Confira os volumes físicos', text: 'As caixas do frio também precisam ser marcadas antes da liberação.' },
    { path: '/romaneios', title: 'Compartilhe a sequência', text: 'O motorista recebe o mesmo romaneio, sem uma nova digitação.' },
  ],
  motorista: [
    { path: '/motorista', title: 'Uma parada por vez', text: 'Veja endereço, caixas e o botão para falar com o cliente.' },
    { path: '/romaneios', title: 'Confira a viagem', text: 'Concluir uma entrega aciona o aviso automático da próxima, simulado neste protótipo.' },
  ],
  gestao: [
    { path: '/gestao', title: 'Visão consolidada da loja', text: 'Os indicadores ficam no perfil de Gestão, fora do atendimento.' },
    { path: '/notificacoes', title: 'Acompanhe os avisos', text: 'Os registros de WhatsApp são simulados neste protótipo.' },
    { path: '/configuracoes', title: 'Configure a operação', text: 'Bairros, veículos e equipe ficam concentrados na gestão.' },
  ],
};

interface Tour { active: boolean; index: number; start: () => void; stop: () => void; next: () => void; prev: () => void }
const Ctx = createContext<Tour | null>(null);
export const useTour = (): Tour => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTour fora do TourProvider');
  return v;
};

export function TourProvider({ children }: { children: ReactNode }) {
  const { role } = useStore();
  const navigate = useNavigate();
  const [index, setIndex] = useState(-1);
  const steps = role ? TOURS[role] : [];

  // Trocar de perfil (ou sair) encerra a jornada.
  useEffect(() => { setIndex(-1); }, [role]);

  const go = useCallback((i: number) => {
    setIndex(i);
    if (steps[i]) navigate(steps[i].path);
  }, [steps, navigate]);

  const value = useMemo<Tour>(() => ({
    active: index >= 0 && index < steps.length,
    index,
    start: () => go(0),
    stop: () => setIndex(-1),
    next: () => (index >= steps.length - 1 ? setIndex(-1) : go(index + 1)),
    prev: () => (index > 0 ? go(index - 1) : undefined),
  }), [index, steps.length, go]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function TourBar() {
  const { role } = useStore();
  const tour = useTour();
  if (!role || !tour.active) return null;
  const steps = TOURS[role];
  const step = steps[tour.index];
  const last = tour.index === steps.length - 1;
  return (
    <div className="tour-bar" role="region" aria-label={`Jornada de ${ROLE_LABELS[role]}`}>
      <span className="tour-step">{tour.index + 1}/{steps.length}</span>
      <div className="grow">
        <span className="eyebrow">JORNADA · {ROLE_LABELS[role].toUpperCase()}</span>
        <strong>{step.title}</strong>
        <div className="muted small">{step.text}</div>
      </div>
      <div className="actions">
        <button type="button" onClick={tour.stop}>Fechar</button>
        <button type="button" onClick={tour.prev} disabled={tour.index === 0}>Anterior</button>
        <button type="button" className="primary" onClick={tour.next}>{last ? 'Concluir' : 'Próximo'}</button>
      </div>
    </div>
  );
}
