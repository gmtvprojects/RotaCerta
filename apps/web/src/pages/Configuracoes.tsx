import { useState } from 'react';
import { useStore } from '../app/store';
import { Header } from './ui';

const TABS = ['Equipe', 'Frota', 'Bairros e zonas', 'Horários de saída'] as const;

export function Configuracoes() {
  const { data, reset } = useStore();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Equipe');
  return (
    <>
      <Header title="A operação do seu jeito." subtitle="Bairros, equipe e regras simples para começar."
        actions={<button type="button" onClick={reset}>Reiniciar dados de demonstração</button>} />
      <div className="chips">{TABS.map((t) => <button key={t} type="button" className={tab === t ? 'chip on' : 'chip'} onClick={() => setTab(t)}>{t}</button>)}</div>
      <section className="card">
        {tab === 'Equipe' && <List rows={data.drivers.map((d) => [d.name, 'Motorista'])} head={['Nome', 'Função']} />}
        {tab === 'Frota' && <List rows={data.vehicles.map((v) => [v.name, v.plate, `${v.capacity} volumes`])} head={['Veículo', 'Placa', 'Capacidade']} />}
        {tab === 'Bairros e zonas' && <List rows={data.neighborhoods.map((n) => [n.name, n.zone])} head={['Bairro', 'Zona']} />}
        {tab === 'Horários de saída' && <List rows={data.departures.map((d) => [d])} head={['Saída habitual']} />}
      </section>
    </>
  );
}

function List({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
