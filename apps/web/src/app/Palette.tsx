import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, type IconName } from './icons';

export interface PaletteItem { key: string; group: string; label: string; hint?: string; icon: IconName; run: () => void }

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Busca do app (Ctrl K ou o botão "Buscar" da doca): leva a qualquer tela do perfil e encontra entregas.
 * A doca só mostra os destinos mais usados; o resto fica aqui.
 * `search` devolve resultados que dependem do texto digitado (as entregas).
 */
export function Palette({ items, search, onClose }: { items: PaletteItem[]; search: (query: string) => PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = plain(query.trim());
    return q ? [...items.filter((i) => plain(i.label).includes(q)), ...search(q)] : items;
  }, [items, search, query]);

  useEffect(() => { setSel(0); }, [query]);
  useEffect(() => { list.current?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' }); }, [sel]);

  const pick = (item?: PaletteItem) => { if (item) { onClose(); item.run(); } };

  return (
    <div className="palette-back" onClick={onClose}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Buscar" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(results[sel]); }
        }}>
        <label className="palette-input">
          <Icon name="search" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tela, cliente ou número da entrega" aria-label="Buscar" />
        </label>
        <div className="palette-list" ref={list}>
          {results.length === 0 && <p className="empty">Nada encontrado para “{query}”.</p>}
          {results.map((item, i) => (
            <div key={item.key}>
              {item.group !== results[i - 1]?.group && <h3>{item.group}</h3>}
              <button type="button" className={`palette-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pick(item)}>
                <Icon name={item.icon} size={18} /><span>{item.label}</span>{item.hint && <small>{item.hint}</small>}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
