import type { Finding, Rule, RuleContext, Severity } from '../types';

function emit(
  ctx: RuleContext,
  ruleId: string,
  severity: Severity,
  message: string,
  path: (string | number)[],
): Finding {
  return {
    ruleId,
    message,
    severity,
    docIndex: ctx.docIndex,
    manifestKind: 'docker-compose',
    pos: ctx.posOf(path),
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

function services(doc: any): Array<[string, any]> {
  const s = doc?.services;
  if (!s || typeof s !== 'object') return [];
  return Object.entries(s);
}

export const dockerComposeRules: Rule[] = [
  {
    id: 'compose/latest-tag',
    description: 'Service uses :latest or implicit image tag',
    severity: 'warning',
    appliesTo: 'docker-compose',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const [name, svc] of services(doc)) {
        const img = svc?.image;
        if (typeof img !== 'string') continue;
        const tag = imageTag(img);
        if (tag === null || tag === 'latest') {
          out.push(
            emit(
              ctx,
              'compose/latest-tag',
              'warning',
              `Service "${name}" uses ${tag === null ? 'an implicit' : 'an explicit :latest'} image tag — pin to a version.`,
              ['services', name, 'image'],
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'compose/privileged',
    description: 'Service runs privileged',
    severity: 'error',
    appliesTo: 'docker-compose',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const [name, svc] of services(doc)) {
        if (svc?.privileged === true) {
          out.push(
            emit(
              ctx,
              'compose/privileged',
              'error',
              `Service "${name}" runs privileged — drop "privileged: true" unless you really need host kernel access.`,
              ['services', name, 'privileged'],
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'compose/host-network',
    description: 'Service uses host network mode',
    severity: 'warning',
    appliesTo: 'docker-compose',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const [name, svc] of services(doc)) {
        if (svc?.network_mode === 'host') {
          out.push(
            emit(
              ctx,
              'compose/host-network',
              'warning',
              `Service "${name}" uses network_mode: host — bypasses Docker's network isolation.`,
              ['services', name, 'network_mode'],
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'compose/docker-socket',
    description: 'Service mounts the Docker socket',
    severity: 'error',
    appliesTo: 'docker-compose',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const [name, svc] of services(doc)) {
        const vols = svc?.volumes;
        if (!Array.isArray(vols)) continue;
        for (let i = 0; i < vols.length; i++) {
          const v = vols[i];
          const src =
            typeof v === 'string'
              ? v.split(':')[0]
              : typeof v === 'object'
              ? v?.source
              : undefined;
          if (typeof src === 'string' && src.includes('/var/run/docker.sock')) {
            out.push(
              emit(
                ctx,
                'compose/docker-socket',
                'error',
                `Service "${name}" mounts the Docker socket — anything in this container effectively has root on the host.`,
                ['services', name, 'volumes', i],
              ),
            );
          }
        }
      }
      return out;
    },
  },
  {
    id: 'compose/no-restart-policy',
    description: 'Service has no restart policy',
    severity: 'info',
    appliesTo: 'docker-compose',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const [name, svc] of services(doc)) {
        if (svc?.restart === undefined && svc?.deploy?.restart_policy === undefined) {
          out.push(
            emit(
              ctx,
              'compose/no-restart-policy',
              'info',
              `Service "${name}" has no restart policy — consider "restart: unless-stopped".`,
              ['services', name],
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'compose/no-mem-limit',
    description: 'Service has no memory limit',
    severity: 'warning',
    appliesTo: 'docker-compose',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const [name, svc] of services(doc)) {
        const hasV2Limit = svc?.mem_limit !== undefined;
        const hasV3Limit = svc?.deploy?.resources?.limits?.memory !== undefined;
        if (!hasV2Limit && !hasV3Limit) {
          out.push(
            emit(
              ctx,
              'compose/no-mem-limit',
              'warning',
              `Service "${name}" has no memory limit — a leak in this container can OOM the whole host.`,
              ['services', name],
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'compose/sensitive-bind-mount',
    description: 'Service bind-mounts a sensitive host path',
    severity: 'error',
    appliesTo: 'docker-compose',
    check(doc, ctx) {
      const sensitive = ['/etc', '/root', '/proc', '/sys', '/'];
      const out: Finding[] = [];
      for (const [name, svc] of services(doc)) {
        const vols = svc?.volumes;
        if (!Array.isArray(vols)) continue;
        for (let i = 0; i < vols.length; i++) {
          const v = vols[i];
          const src =
            typeof v === 'string'
              ? v.split(':')[0]
              : typeof v === 'object'
              ? v?.source
              : undefined;
          if (typeof src !== 'string') continue;
          if (sensitive.some((p) => src === p || src.startsWith(p + '/'))) {
            out.push(
              emit(
                ctx,
                'compose/sensitive-bind-mount',
                'error',
                `Service "${name}" mounts a sensitive host path "${src}".`,
                ['services', name, 'volumes', i],
              ),
            );
          }
        }
      }
      return out;
    },
  },
  {
    id: 'compose/version-deprecated',
    description: 'Top-level "version" key is obsolete in modern Compose',
    severity: 'info',
    appliesTo: 'docker-compose',
    check(doc, ctx) {
      if (doc?.version !== undefined) {
        return [
          emit(
            ctx,
            'compose/version-deprecated',
            'info',
            'The top-level "version" field is obsolete and ignored by Docker Compose v2+ — you can remove it.',
            ['version'],
          ),
        ];
      }
      return [];
    },
  },
];
