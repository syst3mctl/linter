/**
 * Detect what kind of source the user pasted. We sniff before parsing so we
 * can pick the right parser (YAML / Dockerfile / JSON) and the right Monaco
 * language for syntax highlighting.
 */
export type DetectedKind = 'yaml' | 'dockerfile' | 'json';

const DOCKERFILE_INSTRUCTION =
  /^[ \t]*(FROM|ARG|RUN|COPY|ADD|CMD|ENTRYPOINT|ENV|LABEL|EXPOSE|VOLUME|WORKDIR|USER|HEALTHCHECK|ONBUILD|STOPSIGNAL|SHELL|MAINTAINER)\b/m;

export function detectKind(source: string): DetectedKind {
  // Dockerfile signal is strongest — instructions at line start, all-caps.
  if (DOCKERFILE_INSTRUCTION.test(source)) return 'dockerfile';
  // JSON: first non-whitespace char is { or [.
  const trimmed = source.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return 'yaml';
}
