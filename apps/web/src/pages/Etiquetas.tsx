import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { BOX_TYPE_LABELS, routeOrders, type BoxType } from '@rotacerta/domain';
import { useStore } from '../app/store';
import { Empty, Header } from './ui';

/** Etiquetas das caixas de uma carga: número permanente + etiqueta removível da compra atual. */
export function Etiquetas() {
  const { routeId } = useParams();
  const [params, setParams] = useSearchParams();
  const { data } = useStore();
  const route = data.routes.find((r) => r.id === Number(routeId));
  if (!route) return <Navigate to="/carregamento" replace />;

  const only = Number(params.get('pedido')) || null;
  const orders = routeOrders(data, route);
  const labels = orders.flatMap((o, i) => o.boxes
    .filter(() => !only || o.id === only)
    .map((code) => ({ code, order: o, stop: i + 1, info: o.boxDetails?.[code] })));

  return (
    <>
      <Header title="Etiquetas de identificação." subtitle="Fixe o número permanente na caixa e use uma etiqueta removível para a compra atual."
        actions={<>
          <button type="button" className="primary" disabled={labels.length === 0} onClick={() => window.print()}>Imprimir etiquetas</button>
          <Link className="btn" to="/carregamento">Voltar</Link>
        </>} />
      <div className="chips">
        <button type="button" className={!only ? 'chip on' : 'chip'} onClick={() => setParams({})}>Todos os pedidos</button>
        {orders.map((o) => (
          <button key={o.id} type="button" className={only === o.id ? 'chip on' : 'chip'} onClick={() => setParams({ pedido: String(o.id) })}>#{o.id}</button>
        ))}
      </div>
      {labels.length === 0 ? <section className="card"><Empty>Nenhuma caixa para etiquetar.</Empty></section> : (
        <div className="labels">
          {labels.map(({ code, order: o, stop, info }) => {
            const type = (info?.type ?? 'ambient') as BoxType;
            return (
              <article className="label" key={code}>
                <div className="label-perm"><small>CAIXA</small><strong>{code}</strong></div>
                <div className="label-tmp">
                  <small>COMPRA #{o.id} · PARADA {stop}</small>
                  <strong>{o.name}</strong>
                  <span>{o.neighborhood}</span>
                  <span className={type === 'ambient' ? '' : 'label-cold'}>{BOX_TYPE_LABELS[type]} · {info?.location ?? 'Área de expedição'}</span>
                  <small>Romaneio #{route.id}</small>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
