import {
  applyEdits,
  format as jsoncFormat,
  parseTree,
  type Node,
  type ParseError,
  type ParseOptions,
} from 'jsonc-parser';
import type { Position } from '../types';
import { offsetToLineCol } from './yaml-utils';

export interface ParsedJson {
  /** AST root, or undefined if parsing produced nothing usable. */
  root: Node | undefined;
  /** Parse errors collected by jsonc-parser (positions are byte offsets). */
  errors: ParseError[];
  /** True when source contains line or block comments. */
  hasComments: boolean;
  /** True when source contains trailing commas after the last array/object element. */
  hasTrailingCommas: boolean;
}

const PARSE_OPTS: ParseOptions = {
  allowTrailingComma: true,
  disallowComments: false,
};

export function parseJson(source: string): ParsedJson {
  const errors: ParseError[] = [];
  const root = parseTree(source, errors, PARSE_OPTS);
  return {
    root,
    errors,
    hasComments: detectComments(source),
    hasTrailingCommas: detectTrailingCommas(source),
  };
}

/** Format JSON / JSONC, preserving comments. Returns null if format produced no edits. */
export function formatJson(source: string): string {
  const edits = jsoncFormat(source, undefined, {
    tabSize: 2,
    insertSpaces: true,
    eol: '\n',
  });
  if (!edits.length) return source;
  return applyEdits(source, edits);
}

export function nodeToPosition(source: string, node: Node | undefined): Position {
  if (!node) return { line: 1, column: 1, endLine: 1, endColumn: 2 };
  return offsetRangeToPosition(source, node.offset, node.offset + node.length);
}

export function offsetRangeToPosition(
  source: string,
  start: number,
  end: number,
): Position {
  const s = offsetToLineCol(source, start);
  const e = offsetToLineCol(source, end);
  return {
    line: s.line,
    column: s.col,
    endLine: e.line,
    endColumn: e.col,
  };
}

/** Walk every property node in the tree and yield it with its parent object node. */
export function* walkProperties(
  node: Node | undefined,
): Generator<{ key: string; value: Node | undefined; property: Node; parent: Node }> {
  if (!node) return;
  if (node.type === 'object' && node.children) {
    for (const property of node.children) {
      // property children: [key, value]
      const [keyNode, valueNode] = property.children ?? [];
      if (keyNode && typeof keyNode.value === 'string') {
        yield { key: keyNode.value, value: valueNode, property, parent: node };
      }
    }
  }
  for (const child of node.children ?? []) {
    yield* walkProperties(child);
  }
}

/** Find an immediate property of an object node by key. */
export function getProperty(obj: Node | undefined, key: string): Node | undefined {
  if (!obj || obj.type !== 'object') return undefined;
  for (const prop of obj.children ?? []) {
    const [k, v] = prop.children ?? [];
    if (k && typeof k.value === 'string' && k.value === key) return v;
  }
  return undefined;
}

/** Position-of helpers used by JSON rules. */
export function posOfNode(source: string, node: Node | undefined): Position {
  return nodeToPosition(source, node);
}

function detectComments(source: string): boolean {
  // Cheap heuristic: any // outside strings, or any /*. Strings can contain
  // // legitimately, so this is an over-approximation, but the main use is
  // to relax warnings — false positives just suppress, never invent findings.
  return /\/\/[^\n]*|\/\*[\s\S]*?\*\//.test(source);
}

function detectTrailingCommas(source: string): boolean {
  return /,\s*[\]}]/.test(source);
}

export { offsetToLineCol };
