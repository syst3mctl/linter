import { useEffect, useRef, useState } from 'react';
import { examples, type Example } from '../lib/examples';
import { Logo } from './Logo';

interface Props {
  onLoadExample: (e: Example) => void;
  onClear: () => void;
  onFormat: () => void;
  canFormat: boolean;
  source: string;
}

export function Header({
  onLoadExample,
  onClear,
  onFormat,
  canFormat,
  source,
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  async function copy() {
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // noop
    }
  }

  return (
    <header className="relative z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div className="flex items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-4">
          <Logo />
          <div className="hidden h-6 w-px bg-line sm:block" />
          <p className="hidden text-xs text-ink-soft sm:block">
            Manifest linter for Docker, Kubernetes &amp; JSON
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={ref}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="btn-ghost rounded px-3 py-1.5 text-xs font-medium"
            >
              Load example
              <span className="ml-1 text-ink-dim">▾</span>
            </button>
            {open && (
              <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-lg border border-line bg-bg-card shadow-2xl">
                {examples.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      onLoadExample(e);
                      setOpen(false);
                    }}
                    className="block w-full border-b border-line/60 px-4 py-3 text-left text-xs transition last:border-b-0 hover:bg-primary-softer"
                  >
                    <div className="font-medium text-ink">{e.label}</div>
                    <div className="mt-0.5 text-[11px] text-ink-soft">{e.hint}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={onFormat}
            disabled={!source || !canFormat}
            title={
              canFormat
                ? 'Pretty-print JSON (preserves comments)'
                : 'Format is only available for JSON'
            }
            className="btn-ghost rounded px-3 py-1.5 text-xs font-medium"
          >
            Format
          </button>
          <button
            onClick={copy}
            disabled={!source}
            className="btn-ghost rounded px-3 py-1.5 text-xs font-medium"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={onClear}
            disabled={!source}
            className="btn-ghost rounded px-3 py-1.5 text-xs font-medium"
          >
            Clear
          </button>
        </div>
      </div>
    </header>
  );
}
