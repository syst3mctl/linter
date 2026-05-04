import type { Finding, Rule, RuleContext, Severity } from '../types';

const DEPRECATED_APIS: Record<string, string> = {
  'extensions/v1beta1': 'apps/v1 (or networking.k8s.io/v1 for Ingress / NetworkPolicy)',
  'apps/v1beta1': 'apps/v1',
  'apps/v1beta2': 'apps/v1',
  'batch/v1beta1': 'batch/v1',
  'rbac.authorization.k8s.io/v1beta1': 'rbac.authorization.k8s.io/v1',
  'networking.k8s.io/v1beta1': 'networking.k8s.io/v1',
  'autoscaling/v2beta1': 'autoscaling/v2',
  'autoscaling/v2beta2': 'autoscaling/v2',
  'policy/v1beta1': 'policy/v1',
  'scheduling.k8s.io/v1beta1': 'scheduling.k8s.io/v1',
  'storage.k8s.io/v1beta1': 'storage.k8s.io/v1',
};

const POD_SPEC_PATHS: Record<string, (string | number)[]> = {
  Pod: ['spec'],
  Deployment: ['spec', 'template', 'spec'],
  StatefulSet: ['spec', 'template', 'spec'],
  DaemonSet: ['spec', 'template', 'spec'],
  ReplicaSet: ['spec', 'template', 'spec'],
  Job: ['spec', 'template', 'spec'],
  CronJob: ['spec', 'jobTemplate', 'spec', 'template', 'spec'],
};

interface ContainerRef {
  container: any;
  path: (string | number)[];
  podSpec: any;
  podSpecPath: (string | number)[];
}

function getAtPath(obj: any, path: (string | number)[]): any {
  let cur = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function* iterContainers(doc: any): Generator<ContainerRef> {
  const podSpecPath = POD_SPEC_PATHS[doc?.kind];
  if (!podSpecPath) return;
  const podSpec = getAtPath(doc, podSpecPath);
  if (!podSpec || typeof podSpec !== 'object') return;

  for (const key of ['containers', 'initContainers'] as const) {
    const list = podSpec[key];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i++) {
      yield {
        container: list[i],
        path: [...podSpecPath, key, i],
        podSpec,
        podSpecPath,
      };
    }
  }
}

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
    manifestKind: 'kubernetes',
    pos: ctx.posOf(path),
  };
}

function imageTag(img: string): string | null {
  // Strip digest if present.
  const noDigest = img.split('@')[0];
  const lastSlash = noDigest.lastIndexOf('/');
  const namePart = lastSlash >= 0 ? noDigest.slice(lastSlash + 1) : noDigest;
  const colon = namePart.indexOf(':');
  if (colon < 0) return null;
  return namePart.slice(colon + 1);
}

export const kubernetesRules: Rule[] = [
  {
    id: 'k8s/deprecated-api',
    description: 'apiVersion is deprecated or removed',
    severity: 'warning',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const v = doc?.apiVersion;
      if (typeof v === 'string' && DEPRECATED_APIS[v]) {
        return [
          emit(
            ctx,
            'k8s/deprecated-api',
            'warning',
            `apiVersion "${v}" is deprecated — use "${DEPRECATED_APIS[v]}".`,
            ['apiVersion'],
          ),
        ];
      }
      return [];
    },
  },
  {
    id: 'k8s/missing-resource-limits',
    description: 'Container has no resources.limits set',
    severity: 'warning',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const { container, path } of iterContainers(doc)) {
        if (!container?.resources?.limits) {
          out.push(
            emit(
              ctx,
              'k8s/missing-resource-limits',
              'warning',
              `Container "${container?.name ?? '?'}" has no resources.limits — a noisy neighbour can starve the node.`,
              path,
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'k8s/missing-resource-requests',
    description: 'Container has no resources.requests set',
    severity: 'info',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const { container, path } of iterContainers(doc)) {
        if (!container?.resources?.requests) {
          out.push(
            emit(
              ctx,
              'k8s/missing-resource-requests',
              'info',
              `Container "${container?.name ?? '?'}" has no resources.requests — the scheduler can't reason about its footprint.`,
              path,
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'k8s/latest-image-tag',
    description: 'Container uses :latest or implicit tag',
    severity: 'warning',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const { container, path } of iterContainers(doc)) {
        const img = container?.image;
        if (typeof img !== 'string') continue;
        const tag = imageTag(img);
        if (tag === null || tag === 'latest') {
          out.push(
            emit(
              ctx,
              'k8s/latest-image-tag',
              'warning',
              `Container "${container?.name ?? '?'}" uses ${tag === null ? 'an implicit' : 'an explicit :latest'} image tag — pin to an immutable version or digest.`,
              [...path, 'image'],
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'k8s/run-as-root',
    description: 'Container may run as root',
    severity: 'warning',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const { container, path, podSpec } of iterContainers(doc)) {
        const cSec = container?.securityContext ?? {};
        const pSec = podSpec?.securityContext ?? {};
        const runAsNonRoot = cSec.runAsNonRoot ?? pSec.runAsNonRoot;
        const runAsUser = cSec.runAsUser ?? pSec.runAsUser;
        const runsAsRoot = runAsUser === 0 || (runAsUser === undefined && runAsNonRoot !== true);
        if (runsAsRoot) {
          out.push(
            emit(
              ctx,
              'k8s/run-as-root',
              'warning',
              `Container "${container?.name ?? '?'}" may run as root — set securityContext.runAsNonRoot: true and a non-zero runAsUser.`,
              path,
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'k8s/privileged',
    description: 'Container is privileged',
    severity: 'error',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const { container, path } of iterContainers(doc)) {
        if (container?.securityContext?.privileged === true) {
          out.push(
            emit(
              ctx,
              'k8s/privileged',
              'error',
              `Container "${container?.name ?? '?'}" runs privileged — it has near-root access to the host kernel.`,
              [...path, 'securityContext', 'privileged'],
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'k8s/allow-privilege-escalation',
    description: 'allowPrivilegeEscalation is not set to false',
    severity: 'warning',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const { container, path } of iterContainers(doc)) {
        const v = container?.securityContext?.allowPrivilegeEscalation;
        if (v !== false) {
          out.push(
            emit(
              ctx,
              'k8s/allow-privilege-escalation',
              'warning',
              `Container "${container?.name ?? '?'}" should set securityContext.allowPrivilegeEscalation: false.`,
              path,
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'k8s/read-only-root-fs',
    description: 'Root filesystem is writable',
    severity: 'info',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const { container, path } of iterContainers(doc)) {
        if (container?.securityContext?.readOnlyRootFilesystem !== true) {
          out.push(
            emit(
              ctx,
              'k8s/read-only-root-fs',
              'info',
              `Container "${container?.name ?? '?'}" should set securityContext.readOnlyRootFilesystem: true.`,
              path,
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'k8s/missing-probes',
    description: 'Container has no liveness or readiness probe',
    severity: 'info',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const out: Finding[] = [];
      for (const { container, path } of iterContainers(doc)) {
        const missing: string[] = [];
        if (!container?.livenessProbe) missing.push('livenessProbe');
        if (!container?.readinessProbe) missing.push('readinessProbe');
        if (missing.length) {
          out.push(
            emit(
              ctx,
              'k8s/missing-probes',
              'info',
              `Container "${container?.name ?? '?'}" is missing ${missing.join(' and ')}.`,
              path,
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'k8s/host-namespace',
    description: 'Pod uses host namespaces',
    severity: 'error',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const out: Finding[] = [];
      const podSpecPath = POD_SPEC_PATHS[doc?.kind];
      if (!podSpecPath) return out;
      const podSpec = getAtPath(doc, podSpecPath);
      if (!podSpec) return out;
      for (const key of ['hostNetwork', 'hostPID', 'hostIPC'] as const) {
        if (podSpec[key] === true) {
          out.push(
            emit(
              ctx,
              'k8s/host-namespace',
              'error',
              `Pod sets ${key}: true — this breaks container isolation from the host.`,
              [...podSpecPath, key],
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'k8s/dangerous-capabilities',
    description: 'Container adds dangerous Linux capabilities',
    severity: 'error',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const dangerous = new Set([
        'SYS_ADMIN',
        'NET_ADMIN',
        'NET_RAW',
        'SYS_PTRACE',
        'SYS_MODULE',
        'ALL',
      ]);
      const out: Finding[] = [];
      for (const { container, path } of iterContainers(doc)) {
        const adds: string[] = container?.securityContext?.capabilities?.add ?? [];
        const bad = adds.filter((c) => dangerous.has(c));
        if (bad.length) {
          out.push(
            emit(
              ctx,
              'k8s/dangerous-capabilities',
              'error',
              `Container "${container?.name ?? '?'}" adds dangerous capabilities: ${bad.join(', ')}.`,
              [...path, 'securityContext', 'capabilities', 'add'],
            ),
          );
        }
      }
      return out;
    },
  },
  {
    id: 'k8s/missing-required-fields',
    description: 'Manifest is missing apiVersion, kind, or metadata.name',
    severity: 'error',
    appliesTo: 'kubernetes',
    check(doc, ctx) {
      const out: Finding[] = [];
      if (!doc?.apiVersion) {
        out.push(
          emit(ctx, 'k8s/missing-required-fields', 'error', 'Missing required field: apiVersion.', []),
        );
      }
      if (!doc?.kind) {
        out.push(
          emit(ctx, 'k8s/missing-required-fields', 'error', 'Missing required field: kind.', []),
        );
      }
      if (doc?.kind && !doc?.metadata?.name) {
        out.push(
          emit(
            ctx,
            'k8s/missing-required-fields',
            'error',
            'Missing required field: metadata.name.',
            doc?.metadata ? ['metadata'] : [],
          ),
        );
      }
      return out;
    },
  },
];
