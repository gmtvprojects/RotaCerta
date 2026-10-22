import { useState, type ReactNode } from 'react';
import { addDeparture, addDriver, addNeighborhood, addZone, removeDeparture, saveVehicle, type Vehicle } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Header, Modal } from './ui';

const TABS = ['Bairros e zonas', 'Veículos', 'Equipe', 'Horários de saída', 'WhatsApp'] as const;
type Tab = (typeof TABS)[number];

type Form =
  | { kind: 'zone' } | { kind: 'neighborhood' } | { kind: 'driver' } | { kind: 'departure' }
  | { kind: 'vehicle'; vehicle?: Vehicle };

export function Configuracoes() {
  const { data, reset } = useStore();
  const [tab, setTab] = useState<Tab>('Bairros e zonas');
  const [form, setForm] = useState<Form | null>(null);
  const busyVehicles = new Set(data.routes.filter((r) => r.status !== 'finished').map((r) => r.vehicleId));

  return (
    <>
      <Header title="A operação do seu jeito." subtitle="Bairros, equipe e regras simples para começar."
        actions={<button type="button" onClick={() => { if (confirm('Apagar as alterações locais e voltar ao cenário original?')) reset(); }}>Reiniciar demonstração</button>} />
      <div className="chips">{TABS.map((t) => <button key={t} type="button" className={tab === t ? 'chip on' : 'chip'} onClick={() => setTab(t)}>{t}</button>)}</div>

      {tab === 'Bairros e zonas' && (
        <section className="card">
          <div className="card-head"><h2>Bairros e zonas</h2>
            <button type="button" onClick={() => setForm({ kind: 'zone' })}>+ Região</button>
            <button type="button" className="primary" onClick={() => setForm({ kind: 'neighborhood' })}>+ Bairro</button>
          </div>
          {data.zones.map((z) => {
            const hoods = data.neighborhoods.filter((n) => n.zone === z);
            return (
              <div className="conf-zone" key={z}>
                <strong>{z}</strong> <span className="muted small">{hoods.length} bairros cadastrados</span>
                <div className="chips">{hoods.map((n) => <span className="pill blue" key={n.name}>{n.name}</span>)}</div>
              </div>
            );
          })}
          <p className="muted small">Uma operação, seus próprios bairros. As zonas são definidas pela equipe do mercado.</p>
        </section>
      )}

      {tab === 'Veículos' && (
        <section className="card">
          <div className="card-head"><h2>Frota da loja</h2><button type="button" className="primary" onClick={() => setForm({ kind: 'vehicle' })}>+ Veículo</button></div>
          <Table head={['Veículo', 'Identificação fictícia', 'Capacidade de referência', 'Disponibilidade', '']}
            rows={data.vehicles.map((v) => [v.name, v.plate, `${v.capacity} caixas`,
              <span key="s" className={`pill ${busyVehicles.has(v.id) ? 'amber' : 'green'}`}>{busyVehicles.has(v.id) ? 'Em uso' : 'Disponível'}</span>,
              <button key="e" type="button" onClick={() => setForm({ kind: 'vehicle', vehicle: v })}>Editar</button>])} />
          <p className="muted small">Capacidade usada apenas como referência em caixas. Peso, compartimentos e acondicionamento exigem validação operacional.</p>
        </section>
      )}

      {tab === 'Equipe' && (
        <section className="card">
          <div className="card-head"><h2>Motoristas e acesso demonstrativo</h2><button type="button" className="primary" onClick={() => setForm({ kind: 'driver' })}>+ Motorista</button></div>
          <Table head={['Nome', 'Função', 'Status']} rows={data.drivers.map((d) => [d.name, 'Motorista', <span key="s" className="pill green">Ativo na demonstração</span>])} />
          <p className="muted small">Perfis: Gestão, Atendente, Expedição e Motorista. Os perfis não implementam autenticação ou segurança de produção.</p>
        </section>
      )}

      {tab === 'Horários de saída' && (
        <section className="card">
          <div className="card-head"><h2>Saídas habituais</h2><button type="button" className="primary" onClick={() => setForm({ kind: 'departure' })}>+ Horário</button></div>
          <p className="muted small">Referências para o planejamento. A saída continua sendo liberada pela equipe.</p>
          <Table head={['Horário', '']} rows={data.departures.map((t) => [t, <RemoveDeparture key={t} time={t} />])} />
        </section>
      )}

      {tab === 'WhatsApp' && (
        <section className="card">
          <div className="card-head"><h2>Atualização automática ao cliente</h2><span className="pill amber">Demonstração</span></div>
          <Table head={['Regra', 'Comportamento']} rows={[
            ['Gatilho principal', 'Entrega marcada como "Entregue"'],
            ['Destinatário', 'Próximo cliente do romaneio ativo'],
            ['Início da viagem', 'Aviso para o primeiro cliente'],
            ['Envio manual pelo motorista', 'Não existe neste fluxo'],
            ['Duplicidade', 'Um aviso por parada / viagem'],
            ['Sem autorização', 'Cliente que não aceitou receber avisos não recebe mensagem'],
          ]} />
          <p className="muted small">Nenhuma integração real configurada. A versão de produção dependerá de backend, provedor oficial de WhatsApp e configuração de mensagens.</p>
        </section>
      )}

      {form && <ConfigDialog form={form} onClose={() => setForm(null)} />}
    </>
  );
}

function RemoveDeparture({ time }: { time: string }) {
  const { change } = useStore();
  return <button type="button" onClick={() => { const err = change((d) => removeDeparture(d, time)); if (err) alert(err); }}>Remover</button>;
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function ConfigDialog({ form, onClose }: { form: Form; onClose: () => void }) {
  const { data, change } = useStore();
  const v = form.kind === 'vehicle' ? form.vehicle : undefined;
  const [name, setName] = useState(v?.name ?? '');
  const [zone, setZone] = useState(data.zones[0] ?? '');
  const [plate, setPlate] = useState(v?.plate ?? '');
  const [capacity, setCapacity] = useState(String(v?.capacity ?? 24));
  const [time, setTime] = useState('');
  const [error, setError] = useState('');

  const titles = { zone: 'Adicionar região', neighborhood: 'Adicionar bairro', driver: 'Adicionar motorista', departure: 'Adicionar horário de saída', vehicle: v ? 'Editar veículo' : 'Adicionar veículo' };

  const save = () => {
    const err = change((d) => {
      switch (form.kind) {
        case 'zone': return addZone(d, name);
        case 'neighborhood': return addNeighborhood(d, name, zone);
        case 'driver': return addDriver(d, name);
        case 'departure': return addDeparture(d, time);
        case 'vehicle': return saveVehicle(d, { id: v?.id, name, plate, capacity: Number(capacity) });
      }
    });
    if (err) setError(err); else onClose();
  };

  return (
    <Modal title={titles[form.kind]} onClose={onClose} footer={<>
      <button type="button" onClick={onClose}>Cancelar</button>
      <button type="button" className="primary" onClick={save}>Salvar na demonstração</button>
    </>}>
      {form.kind !== 'departure' && (
        <label className="field">
          {{ zone: 'Nome da região', neighborhood: 'Nome do bairro', driver: 'Nome do motorista', vehicle: 'Nome do veículo' }[form.kind]}
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
            placeholder={{ zone: 'Ex.: Região Leste', neighborhood: 'Ex.: Jardim das Árvores', driver: 'Nome completo', vehicle: 'Ex.: Veículo 04' }[form.kind]} />
        </label>
      )}
      {form.kind === 'neighborhood' && (
        <label className="field">Região operacional
          <select value={zone} onChange={(e) => setZone(e.target.value)}>{data.zones.map((z) => <option key={z}>{z}</option>)}</select>
        </label>
      )}
      {form.kind === 'vehicle' && <>
        <label className="field">Identificação (fictícia)<input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Ex.: DEMO-04" /></label>
        <label className="field">Capacidade de referência em caixas
          <input type="number" min={1} max={200} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          <span className="muted small">Estimativa operacional; não representa capacidade de peso.</span>
        </label>
      </>}
      {form.kind === 'departure' && (
        <label className="field">Horário habitual<input type="time" value={time} onChange={(e) => setTime(e.target.value)} autoFocus /></label>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </Modal>
  );
}
