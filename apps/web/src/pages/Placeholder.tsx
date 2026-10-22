import { Empty, Header } from './ui';

export function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <>
      <Header title={title} subtitle={note} />
      <section className="card"><Empty>Tela a portar do demo de referência (reference/demo-original).</Empty></section>
    </>
  );
}
