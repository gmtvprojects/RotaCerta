import { Fragment, type ReactNode } from 'react';

/**
 * Markdown mínimo e seguro para as respostas dos agentes: títulos, listas, tabelas simples, **negrito**, `código` e
 * parágrafos. Monta elementos React (nada de HTML vindo do modelo vira HTML de verdade).
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) { blocks.push(<p key={i} className="md-h">{inline(heading[2])}</p>); i++; continue; }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''));
      blocks.push(<ul key={i}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(<ol key={i}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ol>);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i++].trim().slice(1, -1).split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
      }
      const [head, ...body] = rows;
      blocks.push(
        <div key={i} className="md-table"><table>
          {head && <thead><tr>{head.map((c, k) => <th key={k}>{inline(c)}</th>)}</tr></thead>}
          <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    // parágrafo: junta linhas seguidas até uma linha vazia ou outro bloco
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*•]\s+|\s*\d+[.)]\s+|\s*\|)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={i}>{para.map((p, k) => <Fragment key={k}>{k > 0 && <br />}{inline(p)}</Fragment>)}</p>);
  }
  return <div className="md">{blocks}</div>;
}

/** **negrito** e `código` dentro de uma linha. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    out.push(token.startsWith('**') ? <strong key={m.index}>{token.slice(2, -2)}</strong> : <code key={m.index}>{token.slice(1, -1)}</code>);
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
