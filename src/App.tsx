import { useEffect, useMemo, useState } from 'react';
import { Header } from './components/Header';
import { EditorPane } from './components/EditorPane';
import { FindingsPane } from './components/FindingsPane';
import { lint } from './lint';
import { detectKind } from './lib/detect';
import { formatJson } from './lib/json-utils';
import type { Finding } from './types';

const STORAGE_KEY = 'deploy-linter:source';

export default function App() {
  const [source, setSource] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [debounced, setDebounced] = useState(source);
  const [jump, setJump] = useState<{ line: number; column: number; nonce: number } | null>(
    null,
  );

  // Debounce linting and persistence to keep typing snappy.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(source);
      try {
        if (source) localStorage.setItem(STORAGE_KEY, source);
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }, 220);
    return () => clearTimeout(t);
  }, [source]);

  const findings: Finding[] = useMemo(() => lint(debounced), [debounced]);
  const language = useMemo(() => detectKind(source), [source]);

  return (
    <div className="flex h-full flex-col">
      <Header
        source={source}
        onClear={() => setSource('')}
        onLoadExample={(e) => setSource(e.source)}
        canFormat={language === 'json'}
        onFormat={() => {
          if (language !== 'json') return;
          try {
            const formatted = formatJson(source);
            if (formatted !== source) setSource(formatted);
          } catch {
            // Invalid JSON — leave as-is so the user can see the parse-error finding.
          }
        }}
      />
      <main className="grid min-h-0 flex-1 grid-cols-[1fr_440px]">
        <div className="min-h-0 border-r border-line">
          <EditorPane
            value={source}
            onChange={setSource}
            findings={findings}
            language={language}
            jumpTo={jump}
          />
        </div>
        <div className="min-h-0">
          <FindingsPane
            findings={findings}
            hasSource={!!source.trim()}
            source={source}
            language={language}
            onJump={(f) =>
              setJump({ line: f.pos.line, column: f.pos.column, nonce: Date.now() })
            }
          />
        </div>
      </main>
      <footer className="flex items-center justify-between border-t border-line bg-bg px-6 py-2.5 text-[11px] text-ink-dim">
        <span>
          Static checks only — your source never leaves this browser tab.
        </span>
        <span className="font-mono">
          <span className="text-ink-soft">lang:</span>{' '}
          <span className="text-primary">{language}</span>
        </span>
      </footer>
    </div>
  );
}
