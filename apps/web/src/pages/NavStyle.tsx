import { setNavStyle, useNavStyle, type NavStyle as Style } from '../app/navPref';

const OPTIONS: Array<{ value: Style; title: string; text: string }> = [
  { value: 'side', title: 'Menu lateral', text: 'Todas as telas do seu perfil numa coluna à esquerda, sempre visível.' },
  { value: 'dock', title: 'Barra embaixo', text: 'Barra flutuante com os atalhos do dia a dia e a ação principal.' },
];

/** Escolha do estilo de navegação. Vale só neste aparelho; em telas estreitas o app usa sempre a barra embaixo. */
export function NavStyleCard() {
  const style = useNavStyle();
  return (
    <section className="card" aria-labelledby="nav-style-title">
      <div className="card-head"><h2 id="nav-style-title">Menu de navegação</h2></div>
      <div className="nav-options" role="radiogroup" aria-labelledby="nav-style-title">
        {OPTIONS.map((o) => (
          <label key={o.value} className={`nav-option ${style === o.value ? 'on' : ''}`}>
            <input type="radio" name="nav-style" value={o.value} checked={style === o.value} onChange={() => setNavStyle(o.value)} />
            <span className={`nav-thumb t-${o.value}`} aria-hidden="true"><i /><i /></span>
            <b>{o.title}</b>
            <span className="muted small">{o.text}</span>
          </label>
        ))}
      </div>
      <p className="muted small">A escolha vale só neste aparelho. Em telas estreitas (celular) o app usa sempre a barra embaixo.</p>
    </section>
  );
}
