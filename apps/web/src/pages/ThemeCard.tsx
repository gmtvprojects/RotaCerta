import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { type ColorMode, PALETTES, setThemePref, useThemePref } from '../app/themePref';

/** Escolha do modo (claro/escuro/sistema) e da paleta. Vale só neste aparelho. */
export function ThemeCard() {
  const { mode, palette } = useThemePref();
  return (
    <section className="card" aria-labelledby="theme-title">
      <div className="card-head"><h2 id="theme-title">Tema</h2></div>
      <p className="muted small">Modo de cor</p>
      <SegmentedControl label="Modo de cor" value={mode} onChange={(v) => setThemePref({ mode: v as ColorMode })}>
        <SegmentedControlItem value="system" label="Sistema" />
        <SegmentedControlItem value="light" label="Claro" />
        <SegmentedControlItem value="dark" label="Escuro" />
      </SegmentedControl>
      <p className="muted small" style={{ marginTop: 16 }}>Paleta</p>
      <div className="palette-options" role="radiogroup" aria-label="Paleta">
        {PALETTES.map((p) => (
          <label key={p.value} className={`palette-option ${palette === p.value ? 'on' : ''}`}>
            <input type="radio" name="palette" value={p.value} checked={palette === p.value} onChange={() => setThemePref({ palette: p.value })} />
            <i style={{ background: p.swatch }} aria-hidden="true" />
            <span>{p.label}</span>
          </label>
        ))}
      </div>
      <p className="muted small">A escolha vale só neste aparelho.</p>
    </section>
  );
}
