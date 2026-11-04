import type { Clock } from '@rotacerta/domain';

/** Hora local da loja no formato que o domínio usa nos históricos. */
export function storeClock(tz: string, at = new Date()): Clock {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const time = `${get('hour')}:${get('minute')}`;
  return { time, stamp: `${get('day')}/${get('month')}/${get('year')} · ${time}` };
}
