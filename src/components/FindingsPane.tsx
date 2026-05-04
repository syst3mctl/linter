import type { Finding, Severity } from '../types';

interface Props {
  findings: Finding[];
  onJump: (f: Finding) => void;
  hasSource: boolean;
}

const SEV_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

const SEV_STYLES: Record<
  Severity,
  { dot: string; label: string; border: string; chip: string }
> = {
  error: {
    dot: 'bg-sev-err',
    label: 'text-sev-err',
    border: 'border-l-sev-err/70',
    chip: 'bg-sev-err/10 text-sev-err border border-sev-err/30',
  },
  warning: {
    dot: 'bg-sev-warn',
    label: 'text-sev-warn',
    border: 'border-l-sev-warn/70',
    chip: 'bg-sev-warn/10 text-sev-warn border border-sev-warn/30',
  },
  info: {
    dot: 'bg-primary',
    label: 'text-primary',
    border: 'border-l-primary/70',
    chip: 'bg-primary-softer text-primary border border-primary-ring',
  },
};

export function FindingsPane({ findings, onJump, hasSource }: Props) {
  const sorted = [...findings].sort((a, b) => {
    const s = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
    if (s !== 0) return s;
    return a.pos.line - b.pos.line;
  });

  const counts = {
    error: findings.filter((f) => f.severity === 'error').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  return (
    <div className="flex h-full flex-col bg-bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
          Findings
        </h2>
        <div className="flex items-center gap-1.5 font-mono text-[10px]">
          <span className={`rounded px-2 py-0.5 ${SEV_STYLES.error.chip}`}>
            {counts.error} err
          </span>
          <span className={`rounded px-2 py-0.5 ${SEV_STYLES.warning.chip}`}>
            {counts.warning} warn
          </span>
          <span className={`rounded px-2 py-0.5 ${SEV_STYLES.info.chip}`}>
            {counts.info} info
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!hasSource && <EmptyState />}
        {hasSource && sorted.length === 0 && <CleanState />}
        {sorted.map((f, i) => {
          const s = SEV_STYLES[f.severity];
          return (
            <button
              key={i}
              onClick={() => onJump(f)}
              className={`group block w-full border-b border-line/60 border-l-2 px-4 py-3 text-left transition hover:bg-primary-softer ${s.border}`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[10px] font-bold uppercase tracking-wider ${s.label}`}
                    >
                      {f.severity}
                    </span>
                    <span className="truncate font-mono text-[10px] text-ink-dim">
                      {f.ruleId}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-dim">
                      L{f.pos.line}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {f.message}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-lg border border-line bg-bg text-ink-soft">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 6H14M4 12H10M4 18H12M19 12L17 14M19 12L17 10M19 12H13"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="mt-3 font-mono text-xs uppercase tracking-wider text-ink-soft">
        Awaiting input
      </p>
      <p className="mt-1.5 max-w-[18rem] text-xs leading-relaxed text-ink-dim">
        Paste a manifest on the left, or load an example from the top right.
      </p>
    </div>
  );
}

function CleanState() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-lg border border-primary-ring bg-primary-softer text-primary shadow-glow-green">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 12L10 17L19 7"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="mt-3 font-mono text-xs uppercase tracking-wider text-primary">
        No issues found
      </p>
      <p className="mt-1.5 max-w-[18rem] text-xs leading-relaxed text-ink-dim">
        Static checks only — review the output before applying.
      </p>
    </div>
  );
}
