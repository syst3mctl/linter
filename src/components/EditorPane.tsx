import Editor, { type OnMount } from '@monaco-editor/react';
import { useEffect, useRef } from 'react';
import type { Finding, Severity } from '../types';

interface Props {
  value: string;
  onChange: (v: string) => void;
  findings: Finding[];
  language: 'yaml' | 'dockerfile' | 'json';
  jumpTo?: { line: number; column: number; nonce: number } | null;
}

const SEV_TO_MONACO: Record<Severity, number> = {
  error: 8, // monaco.MarkerSeverity.Error
  warning: 4,
  info: 2,
};

export function EditorPane({ value, onChange, findings, language, jumpTo }: Props) {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.editor.defineTheme('lintctl-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
        { token: 'string', foreground: 'd1ffe0' },
        { token: 'number', foreground: 'a594ff' },
        { token: 'keyword', foreground: '11a32a', fontStyle: 'bold' },
        { token: 'type', foreground: '11a32a' },
        { token: 'key.identifier.json', foreground: 'ffffff' },
      ],
      colors: {
        'editor.background': '#1e1d1d',
        'editor.foreground': '#ffffff',
        'editorLineNumber.foreground': '#64748b',
        'editorLineNumber.activeForeground': '#11a32a',
        'editorCursor.foreground': '#11a32a',
        'editor.selectionBackground': '#11a32a4d',
        'editor.inactiveSelectionBackground': '#11a32a26',
        'editor.lineHighlightBackground': '#ffffff0a',
        'editor.lineHighlightBorder': '#00000000',
        'editorIndentGuide.background1': '#ffffff0a',
        'editorIndentGuide.activeBackground1': '#11a32a4d',
        'editorWidget.background': '#0a0b10',
        'editorWidget.border': '#64748833',
        'editorBracketMatch.background': '#11a32a33',
        'editorBracketMatch.border': '#11a32a99',
        'editorOverviewRuler.errorForeground': '#ff5f57',
        'editorOverviewRuler.warningForeground': '#febc2e',
        'editorOverviewRuler.infoForeground': '#28c840',
        'editorError.foreground': '#ff5f57',
        'editorWarning.foreground': '#febc2e',
        'editorInfo.foreground': '#28c840',
        'editorGutter.background': '#1e1d1d',
        'scrollbarSlider.background': '#64748833',
        'scrollbarSlider.hoverBackground': '#11a32a66',
        'scrollbarSlider.activeBackground': '#11a32a99',
      },
    });
    monaco.editor.setTheme('lintctl-dark');
  };

  // Apply markers whenever findings change.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    const markers = findings.map((f) => ({
      startLineNumber: f.pos.line,
      startColumn: f.pos.column,
      endLineNumber: f.pos.endLine,
      endColumn: Math.max(f.pos.endColumn, f.pos.column + 1),
      message: `[${f.ruleId}] ${f.message}`,
      severity: SEV_TO_MONACO[f.severity],
    }));
    monaco.editor.setModelMarkers(model, 'lintctl', markers);
  }, [findings]);

  // Jump-to-line on click in findings panel.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !jumpTo) return;
    editor.revealLineInCenter(jumpTo.line);
    editor.setPosition({ lineNumber: jumpTo.line, column: jumpTo.column });
    editor.focus();
  }, [jumpTo]);

  return (
    <div className="relative h-full w-full bg-bg">
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        onMount={onMount}
        theme="lintctl-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
          fontLigatures: true,
          lineNumbersMinChars: 3,
          padding: { top: 16, bottom: 16 },
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          tabSize: 2,
          wordWrap: 'on',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'line',
          guides: { indentation: true, highlightActiveIndentation: true },
        }}
      />
      {!value && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center px-6">
          <div className="max-w-md rounded-lg border border-line bg-bg-card/60 p-6 text-center backdrop-blur">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded border border-primary-ring bg-primary-softer text-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12L10 17L19 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-ink">Paste a manifest to begin</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              Drop in a Kubernetes YAML, docker-compose.yml, Dockerfile, or any
              JSON file. Linting runs as you type — nothing is uploaded.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
