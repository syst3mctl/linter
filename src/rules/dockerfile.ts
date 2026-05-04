import {
  DockerfileParser,
  type Dockerfile,
  type Instruction,
} from 'dockerfile-ast';
import type { Range } from 'vscode-languageserver-types';
import type { Finding, Position, Severity } from '../types';

function rangeToPos(range: Range | null | undefined): Position {
  if (!range) return { line: 1, column: 1, endLine: 1, endColumn: 2 };
  return {
    line: range.start.line + 1,
    column: range.start.character + 1,
    endLine: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

function emit(
  ruleId: string,
  severity: Severity,
  message: string,
  range: Range | null | undefined,
): Finding {
  return {
    ruleId,
    message,
    severity,
    docIndex: 0,
    manifestKind: 'dockerfile',
    pos: rangeToPos(range),
  };
}

function imageTag(img: string): string | null {
  const noDigest = img.split('@')[0];
  const lastSlash = noDigest.lastIndexOf('/');
  const namePart = lastSlash >= 0 ? noDigest.slice(lastSlash + 1) : noDigest;
  const colon = namePart.indexOf(':');
  if (colon < 0) return null;
  return namePart.slice(colon + 1);
}

interface DockerfileRule {
  id: string;
  check: (df: Dockerfile) => Finding[];
}

const rules: DockerfileRule[] = [
  // FROM <image> with no tag, or :latest
  {
    id: 'dockerfile/from-latest-tag',
    check(df) {
      const out: Finding[] = [];
      for (const from of df.getFROMs()) {
        const img = from.getImage();
        if (!img) continue;
        // Skip multi-stage references like `FROM builder` (already-defined stage).
        const buildStages = new Set(
          df.getFROMs().map((f) => f.getBuildStage()).filter(Boolean) as string[],
        );
        if (buildStages.has(img)) continue;
        const tag = imageTag(img);
        const digest = from.getImageDigest();
        if (digest) continue; // pinned by digest is fine
        if (tag === null) {
          out.push(
            emit(
              'dockerfile/from-latest-tag',
              'warning',
              `FROM "${img}" has no tag — pin to a version (e.g. "${img}:1.2.3") or a digest.`,
              from.getImageRange() ?? from.getRange(),
            ),
          );
        } else if (tag === 'latest') {
          out.push(
            emit(
              'dockerfile/from-latest-tag',
              'warning',
              `FROM "${img}" pins to :latest — pin to an immutable version or digest.`,
              from.getImageTagRange() ?? from.getRange(),
            ),
          );
        }
      }
      return out;
    },
  },

  // No USER instruction → container runs as root
  {
    id: 'dockerfile/no-user',
    check(df) {
      const all = df.getInstructions();
      const hasUser = all.some((i) => i.getKeyword() === 'USER');
      if (hasUser) return [];
      const lastFrom = df.getFROMs().slice(-1)[0];
      return [
        emit(
          'dockerfile/no-user',
          'warning',
          'No USER instruction — the container will run as root. Add `USER <non-root>`.',
          lastFrom?.getRange() ?? all[0]?.getRange(),
        ),
      ];
    },
  },

  // No HEALTHCHECK
  {
    id: 'dockerfile/no-healthcheck',
    check(df) {
      const hcs = df.getHEALTHCHECKs();
      if (hcs.length > 0) {
        // HEALTHCHECK NONE explicitly disables it — that's intentional, not a finding.
        return [];
      }
      const lastFrom = df.getFROMs().slice(-1)[0];
      return [
        emit(
          'dockerfile/no-healthcheck',
          'info',
          'No HEALTHCHECK instruction — orchestrators can\'t tell if your container is healthy.',
          lastFrom?.getRange(),
        ),
      ];
    },
  },

  // CMD/ENTRYPOINT in shell form (recommend exec/JSON form)
  {
    id: 'dockerfile/shell-form-entrypoint',
    check(df) {
      const out: Finding[] = [];
      const check = (instr: Instruction, name: string) => {
        const json = (instr as any).getOpeningBracket?.();
        if (!json) {
          out.push(
            emit(
              'dockerfile/shell-form-entrypoint',
              'info',
              `${name} uses shell form — prefer exec form (JSON array) so signals (SIGTERM) reach your process.`,
              instr.getRange(),
            ),
          );
        }
      };
      df.getCMDs().forEach((c) => check(c, 'CMD'));
      df.getENTRYPOINTs().forEach((e) => check(e, 'ENTRYPOINT'));
      return out;
    },
  },

  // apt-get install without --no-install-recommends
  {
    id: 'dockerfile/apt-no-install-recommends',
    check(df) {
      const out: Finding[] = [];
      for (const instr of df.getInstructions()) {
        if (instr.getKeyword() !== 'RUN') continue;
        const args = instr.getArgumentsContent() ?? '';
        if (/\bapt(?:-get)?\s+install\b/.test(args) && !/--no-install-recommends/.test(args)) {
          out.push(
            emit(
              'dockerfile/apt-no-install-recommends',
              'warning',
              'apt-get install should use --no-install-recommends to keep the image small.',
              instr.getRange(),
            ),
          );
        }
      }
      return out;
    },
  },

  // apt-get install without cache cleanup
  {
    id: 'dockerfile/apt-no-cache-cleanup',
    check(df) {
      const out: Finding[] = [];
      for (const instr of df.getInstructions()) {
        if (instr.getKeyword() !== 'RUN') continue;
        const args = instr.getArgumentsContent() ?? '';
        if (
          /\bapt(?:-get)?\s+install\b/.test(args) &&
          !/rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(args)
        ) {
          out.push(
            emit(
              'dockerfile/apt-no-cache-cleanup',
              'warning',
              'apt-get install leaves apt lists behind — append `&& rm -rf /var/lib/apt/lists/*` in the same RUN.',
              instr.getRange(),
            ),
          );
        }
      }
      return out;
    },
  },

  // apk add without --no-cache
  {
    id: 'dockerfile/apk-no-cache',
    check(df) {
      const out: Finding[] = [];
      for (const instr of df.getInstructions()) {
        if (instr.getKeyword() !== 'RUN') continue;
        const args = instr.getArgumentsContent() ?? '';
        if (/\bapk\s+add\b/.test(args) && !/--no-cache/.test(args)) {
          out.push(
            emit(
              'dockerfile/apk-no-cache',
              'warning',
              'apk add should use --no-cache to avoid leaving an apk index in the image.',
              instr.getRange(),
            ),
          );
        }
      }
      return out;
    },
  },

  // ADD where COPY would do (no URL, no .tar)
  {
    id: 'dockerfile/add-instead-of-copy',
    check(df) {
      const out: Finding[] = [];
      for (const instr of df.getInstructions()) {
        if (instr.getKeyword() !== 'ADD') continue;
        const args = instr.getArgumentsContent() ?? '';
        const hasUrl = /https?:\/\//.test(args);
        const hasArchive = /\.(tar|tar\.gz|tgz|tar\.bz2|tbz2|tar\.xz|txz|zip)\b/.test(args);
        if (!hasUrl && !hasArchive) {
          out.push(
            emit(
              'dockerfile/add-instead-of-copy',
              'info',
              'ADD has implicit behaviour (URL fetch, archive extraction). Use COPY for plain file copies.',
              instr.getRange(),
            ),
          );
        }
      }
      return out;
    },
  },

  // MAINTAINER deprecated
  {
    id: 'dockerfile/maintainer-deprecated',
    check(df) {
      const out: Finding[] = [];
      for (const instr of df.getInstructions()) {
        if (instr.getKeyword() === 'MAINTAINER') {
          out.push(
            emit(
              'dockerfile/maintainer-deprecated',
              'warning',
              'MAINTAINER is deprecated — use `LABEL maintainer="..."` instead.',
              instr.getRange(),
            ),
          );
        }
      }
      return out;
    },
  },

  // RUN with a pipe but no `set -o pipefail`
  {
    id: 'dockerfile/pipe-no-pipefail',
    check(df) {
      const out: Finding[] = [];
      for (const instr of df.getInstructions()) {
        if (instr.getKeyword() !== 'RUN') continue;
        const args = instr.getArgumentsContent() ?? '';
        // Pipe outside a quoted string. Naïve but catches the common case.
        const hasPipe = /[^|]\|[^|]/.test(args);
        const hasPipefail = /set\s+-[a-zA-Z]*o\s+pipefail|pipefail/.test(args);
        if (hasPipe && !hasPipefail) {
          out.push(
            emit(
              'dockerfile/pipe-no-pipefail',
              'info',
              'RUN with a pipe should `set -o pipefail` first, or a failing left-hand command will be silently ignored.',
              instr.getRange(),
            ),
          );
        }
      }
      return out;
    },
  },

  // WORKDIR with a relative path
  {
    id: 'dockerfile/workdir-relative',
    check(df) {
      const out: Finding[] = [];
      for (const instr of df.getInstructions()) {
        if (instr.getKeyword() !== 'WORKDIR') continue;
        const path = (instr as any).getPath?.();
        if (typeof path === 'string' && path && !path.startsWith('/') && !path.startsWith('$')) {
          out.push(
            emit(
              'dockerfile/workdir-relative',
              'warning',
              `WORKDIR uses a relative path "${path}" — use an absolute path so behaviour doesn't depend on the previous WORKDIR.`,
              instr.getRange(),
            ),
          );
        }
      }
      return out;
    },
  },

  // USER root explicitly
  {
    id: 'dockerfile/user-is-root',
    check(df) {
      const out: Finding[] = [];
      for (const instr of df.getInstructions()) {
        if (instr.getKeyword() !== 'USER') continue;
        const args = (instr.getArgumentsContent() ?? '').trim();
        if (args === 'root' || args === '0' || args.startsWith('0:') || args.startsWith('root:')) {
          out.push(
            emit(
              'dockerfile/user-is-root',
              'warning',
              'USER is explicitly set to root — defeats the purpose. Use a non-root user.',
              instr.getRange(),
            ),
          );
        }
      }
      return out;
    },
  },
];

export function lintDockerfile(source: string): Finding[] {
  const out: Finding[] = [];
  let df: Dockerfile;
  try {
    df = DockerfileParser.parse(source);
  } catch (e: any) {
    return [
      emit(
        'dockerfile/parse-error',
        'error',
        e?.message ?? 'Failed to parse Dockerfile.',
        null,
      ),
    ];
  }

  // Bail-out: if there are no instructions at all, this isn't really a Dockerfile.
  if (df.getInstructions().length === 0) return out;

  // FROM is required as the first non-comment / non-ARG instruction.
  if (df.getFROMs().length === 0) {
    out.push(
      emit(
        'dockerfile/missing-from',
        'error',
        'Dockerfile is missing a FROM instruction.',
        df.getInstructions()[0]?.getRange(),
      ),
    );
  }

  for (const rule of rules) {
    try {
      out.push(...rule.check(df));
    } catch {
      // A buggy rule shouldn't crash the linter.
    }
  }
  return out;
}
