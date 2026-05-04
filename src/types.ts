export type Severity = 'error' | 'warning' | 'info';

export type ManifestKind =
  | 'kubernetes'
  | 'docker-compose'
  | 'dockerfile'
  | 'json'
  | 'package.json'
  | 'tsconfig.json'
  | 'unknown';

export interface Position {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

export interface Finding {
  ruleId: string;
  message: string;
  severity: Severity;
  docIndex: number;
  manifestKind: ManifestKind;
  pos: Position;
}

export interface RuleContext {
  docIndex: number;
  posOf: (path: (string | number)[]) => Position;
}

export interface Rule {
  id: string;
  description: string;
  severity: Severity;
  appliesTo: ManifestKind;
  check: (doc: any, ctx: RuleContext) => Finding[];
}
