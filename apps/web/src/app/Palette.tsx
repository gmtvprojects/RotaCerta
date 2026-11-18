import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Icon, type IconName } from './icons';
import { BOUNCY } from './motion';

export interface PaletteItem { key: string; group: string; label: string; hint?: string; icon: IconName; run: () => void }

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Busca do sistema (Ctrl K ou o campo no centro do topo): encontra entregas, clientes, romaneios, equipe, caixas e
 * telas, e tem ações rápidas. `items` aparece sem digitar nada (telas e ações); `search` traz os dados que batem
 * com o texto (ver `globalSearch.ts`).
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
    <motion.div className="palette-back" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>
      <motion.div className="palette" initial={{ opacity: 0, scale: 0.96, y: -12 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={BOUNCY} role="dialog" aria-modal="true" aria-label="Buscar" onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); pick(results[sel]); }
        }}>
        <label className="palette-input">
          <Icon name="search" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar entregas, clientes, romaneios, motoristas, caixas ou telas" aria-label="Buscar" />
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
      </motion.div>
    </motion.div>
  );
}
