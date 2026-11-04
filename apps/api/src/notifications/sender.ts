import type { Notification } from '@rotacerta/domain';

export type SendResult = { ok: true } | { ok: false; reason: string };

/**
 * Porta de saída dos avisos ao cliente. Hoje só existe a versão simulada;
 * a integração com a WhatsApp Cloud API entra aqui sem mexer nas regras do domínio.
 */
export interface NotificationSender {
  send(notification: Notification): Promise<SendResult>;
}

export class SimulatedSender implements NotificationSender {
  async send(): Promise<SendResult> { return { ok: true }; }
}
