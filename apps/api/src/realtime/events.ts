import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';

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

const CHANNEL = 'rotacerta:events';

/**
 * Barramento de eventos. Em memória por padrão (uma instância da API); com `connectRedis` os eventos
 * também passam por Redis pub/sub, e assim chegam aos dispositivos ligados a qualquer réplica.
 * Todo evento é de uma empresa: cada assinante recebe apenas os da sua.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly origin = randomUUID();
  private pub?: Redis;
  private sub?: Redis;

  /** Liga o barramento ao Redis. Se o Redis cair, a instância segue entregando os eventos locais. */
  connectRedis(url: string, onError: (err: Error) => void = () => {}) {
    this.pub = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: false });
    this.sub = new Redis(url, { maxRetriesPerRequest: null });
    this.pub.on('error', onError);
    this.sub.on('error', onError);
    void this.sub.subscribe(CHANNEL);
    this.sub.on('message', (_channel, raw) => {
      try {
        const { origin, event } = JSON.parse(raw) as { origin: string; event: AppEvent };
        if (origin !== this.origin) this.emitter.emit('event', event); // o que nasceu aqui já foi entregue localmente
      } catch { /* mensagem malformada: ignora */ }
    });
  }

  async close() { this.pub?.disconnect(); this.sub?.disconnect(); }

  publish(event: AppEvent) {
    this.emitter.emit('event', event);
    this.pub?.publish(CHANNEL, JSON.stringify({ origin: this.origin, event })).catch(() => {});
  }

  subscribe(companyId: number, fn: (e: AppEvent) => void): () => void {
    const listener = (e: AppEvent) => { if (e.companyId === companyId) fn(e); };
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}
