import { EventEmitter } from 'node:events';

/** Aviso enviado aos dispositivos conectados: algo mudou, busque o estado de novo. */
export interface ChangeEvent { type: 'changed'; companyId: number; scope: string; at: string }

/** Nova posição de um motorista em viagem. Só gestão e expedição da mesma empresa recebem. */
export interface LocationEvent {
  type: 'location';
  companyId: number;
  routeId: number;
  driverId: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
}

export type AppEvent = ChangeEvent | LocationEvent;

/**
 * Barramento em memória (uma instância da API). Para várias instâncias (ECS/Railway com réplicas),
 * trocar por Redis pub/sub mantendo esta mesma interface.
 * Todo evento é de uma empresa: cada assinante recebe apenas os da sua.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  publish(event: AppEvent) { this.emitter.emit('event', event); }

  subscribe(companyId: number, fn: (e: AppEvent) => void): () => void {
    const listener = (e: AppEvent) => { if (e.companyId === companyId) fn(e); };
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
