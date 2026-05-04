import { parseAllDocuments } from 'yaml';
import type { Finding, ManifestKind } from './types';
import { offsetToLineCol, positionAt, fallbackPosition } from './lib/yaml-utils';
import { kubernetesRules, dockerComposeRules } from './rules';
import { lintDockerfile } from './rules/dockerfile';
import { lintJson } from './rules/json';
import { detectKind as detectLanguage } from './lib/detect';

function detectYamlKind(json: any): ManifestKind {
  if (json && typeof json === 'object') {
    if ('apiVersion' in json && 'kind' in json) return 'kubernetes';
    if ('services' in json && typeof json.services === 'object') return 'docker-compose';
  }
  return 'unknown';
}

export function lint(source: string): Finding[] {
  const findings: Finding[] = [];
  if (!source.trim()) return findings;

  const language = detectLanguage(source);
  if (language === 'dockerfile') return lintDockerfile(source);
  if (language === 'json') return lintJson(source);

  let docs;
  try {
    docs = parseAllDocuments(source);
  } catch (e: any) {
    findings.push({
      ruleId: 'yaml/parse-error',
      message: e?.message ?? 'Failed to parse YAML.',
      severity: 'error',
      docIndex: 0,
      manifestKind: 'unknown',
      pos: fallbackPosition(),
    });
    return findings;
  }

  docs.forEach((doc, docIndex) => {
    for (const err of doc.errors) {
      const offset = err.pos?.[0] ?? 0;
      const lc = offsetToLineCol(source, offset);
      findings.push({
        ruleId: 'yaml/syntax',
        message: err.message,
        severity: 'error',
        docIndex,
        manifestKind: 'unknown',
        pos: { line: lc.line, column: lc.col, endLine: lc.line, endColumn: lc.col + 1 },
      });
    }
    for (const warn of doc.warnings) {
      const offset = warn.pos?.[0] ?? 0;
      const lc = offsetToLineCol(source, offset);
      findings.push({
        ruleId: 'yaml/warning',
        message: warn.message,
        severity: 'warning',
        docIndex,
        manifestKind: 'unknown',
        pos: { line: lc.line, column: lc.col, endLine: lc.line, endColumn: lc.col + 1 },
      });
    }

    if (doc.errors.length > 0) return;

    const json = doc.toJS();
    if (json == null) return;

    const kind = detectYamlKind(json);
    if (kind === 'unknown') return;

    const ctx = {
      docIndex,
      posOf: (path: (string | number)[]) => positionAt(doc, source, path),
    };

    const rules = kind === 'kubernetes' ? kubernetesRules : dockerComposeRules;
    for (const rule of rules) {
      try {
        findings.push(...rule.check(json, ctx));
      } catch {
        // A buggy rule shouldn't crash the linter.
      }
    }
  });

  return findings;
}
