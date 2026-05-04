import { Document, isMap, isScalar, isSeq } from 'yaml';
import type { Position } from '../types';

export function offsetToLineCol(source: string, offset: number): { line: number; col: number } {
  let line = 1;
  let col = 1;
  const max = Math.min(offset, source.length);
  for (let i = 0; i < max; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      col = 1;
    } else {
      col++;
    }
  }
  return { line, col };
}

function rangeToPosition(source: string, range: [number, number, number]): Position {
  const start = offsetToLineCol(source, range[0]);
  const end = offsetToLineCol(source, range[1]);
  return {
    line: start.line,
    column: start.col,
    endLine: end.line,
    endColumn: end.col,
  };
}

export function fallbackPosition(): Position {
  return { line: 1, column: 1, endLine: 1, endColumn: 2 };
}

/**
 * Resolve a JS path (e.g. ["spec", "template", "spec", "containers", 0, "image"])
 * to a source position in the YAML document. Prefers the key node when the final
 * segment is a map key (more compact highlight), falls back to the value node.
 */
export function positionAt(
  doc: Document,
  source: string,
  path: (string | number)[],
): Position {
  let node: any = doc.contents;
  let keyNode: any = null;

  for (const segment of path) {
    if (node == null) break;
    if (isMap(node)) {
      const item = node.items.find(
        (it: any) => isScalar(it.key) && (it.key as any).value === segment,
      );
      if (!item) {
        node = null;
        break;
      }
      keyNode = item.key;
      node = item.value;
    } else if (isSeq(node) && typeof segment === 'number') {
      node = node.items[segment];
      keyNode = null;
    } else {
      node = null;
      break;
    }
  }

  const target = keyNode ?? node;
  if (target && Array.isArray(target.range)) {
    return rangeToPosition(source, target.range);
  }
  return fallbackPosition();
}
