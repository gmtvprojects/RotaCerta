import { EventEmitter } from 'node:events';

/** Aviso enviado aos dispositivos conectados: algo mudou, busque o estado de novo. */
export interface ChangeEvent { type: 'changed'; scope: string; at: string }

/**
 * Barramento em memória (uma instância da API). Para várias instâncias (ECS/Railway com réplicas),
 * trocar por Redis pub/sub mantendo esta mesma interface.
 */
export class EventBus {
  private readonly emitter = new EventEmitter();

  publish(event: ChangeEvent) { this.emitter.emit('change', event); }

  subscribe(fn: (e: ChangeEvent) => void): () => void {
    this.emitter.on('change', fn);
    return () => this.emitter.off('change', fn);
  }
}
