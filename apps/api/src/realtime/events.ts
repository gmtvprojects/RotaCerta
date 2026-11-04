import { EventEmitter } from 'node:events';

/** Aviso enviado aos dispositivos conectados: algo mudou, busque o estado de novo. */
export interface ChangeEvent { type: 'changed'; scope: string; at: string }

/** Nova posição de um motorista em viagem. Só gestão e expedição recebem. */
export interface LocationEvent {
  type: 'location';
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
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  publish(event: AppEvent) { this.emitter.emit('event', event); }

  subscribe(fn: (e: AppEvent) => void): () => void {
    this.emitter.on('event', fn);
    return () => this.emitter.off('event', fn);
  }
}
