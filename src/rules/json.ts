import {
  printParseErrorCode,
  type Node,
  type ParseError,
} from 'jsonc-parser';
import type { Finding, ManifestKind, Severity } from '../types';
import {
  getProperty,
  offsetRangeToPosition,
  parseJson,
  posOfNode,
  walkProperties,
} from '../lib/json-utils';

function emit(
  source: string,
  ruleId: string,
  severity: Severity,
  message: string,
  node: Node | undefined,
  manifestKind: ManifestKind = 'json',
): Finding {
  return {
    ruleId,
    message,
    severity,
    docIndex: 0,
    manifestKind,
    pos: posOfNode(source, node),
  };
}

function parseErrorToFinding(source: string, err: ParseError): Finding {
  return {
    ruleId: 'json/syntax',
    severity: 'error',
    message: `Parse error: ${printParseErrorCode(err.error)}.`,
    docIndex: 0,
    manifestKind: 'json',
    pos: offsetRangeToPosition(source, err.offset, err.offset + Math.max(err.length, 1)),
  };
}

function detectKind(root: Node | undefined): {
  kind: ManifestKind;
  jsonc: boolean;
} {
  if (!root || root.type !== 'object') return { kind: 'json', jsonc: false };
  const hasName = !!getProperty(root, 'name');
  const hasVersion = !!getProperty(root, 'version');
  const hasCompilerOptions = !!getProperty(root, 'compilerOptions');
  if (hasName && hasVersion) return { kind: 'package.json', jsonc: false };
  if (hasCompilerOptions) return { kind: 'tsconfig.json', jsonc: true };
  return { kind: 'json', jsonc: false };
}

const NPM_NAME = /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
const SEMVER =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function lintPackageJson(source: string, root: Node): Finding[] {
  const out: Finding[] = [];

  const nameNode = getProperty(root, 'name');
  if (nameNode && typeof nameNode.value === 'string') {
    if (!NPM_NAME.test(nameNode.value)) {
      out.push(
        emit(
          source,
          'package/invalid-name',
          'error',
          `"name" must be lowercase, URL-safe, and may include scope prefix — got "${nameNode.value}".`,
          nameNode,
          'package.json',
        ),
      );
    }
    if (nameNode.value.length > 214) {
      out.push(
        emit(
          source,
          'package/name-too-long',
          'warning',
          '"name" must be 214 characters or fewer.',
          nameNode,
          'package.json',
        ),
      );
    }
  }

  const versionNode = getProperty(root, 'version');
  if (versionNode && typeof versionNode.value === 'string') {
    if (!SEMVER.test(versionNode.value)) {
      out.push(
        emit(
          source,
          'package/invalid-version',
          'error',
          `"version" must be valid semver (MAJOR.MINOR.PATCH) — got "${versionNode.value}".`,
          versionNode,
          'package.json',
        ),
      );
    }
  }

  if (!getProperty(root, 'license')) {
    out.push(
      emit(
        source,
        'package/missing-license',
        'info',
        'No "license" field — npm will publish this as UNLICENSED.',
        root,
        'package.json',
      ),
    );
  }

  if (!getProperty(root, 'description')) {
    out.push(
      emit(
        source,
        'package/missing-description',
        'info',
        'No "description" field — registries and IDEs use this for previews.',
        root,
        'package.json',
      ),
    );
  }

  // Common typo: dependancies / devDependancies / peerDependancies …
  for (const { key, property } of walkProperties(root)) {
    if (/^(dev|peer|optional|bundled?)?[Dd]ependanc/.test(key)) {
      out.push(
        emit(
          source,
          'package/typo-dependancies',
          'error',
          `"${key}" is misspelled — did you mean "${key.replace('ependanc', 'ependenc')}"?`,
          property,
          'package.json',
        ),
      );
    }
  }

  // Both "main" and "module"/"exports" are missing → likely no entry
  const hasEntry =
    getProperty(root, 'main') ||
    getProperty(root, 'module') ||
    getProperty(root, 'exports') ||
    getProperty(root, 'bin');
  if (!hasEntry) {
    out.push(
      emit(
        source,
        'package/no-entry',
        'info',
        'No "main", "module", "exports", or "bin" field — consumers won\'t know what to import.',
        root,
        'package.json',
      ),
    );
  }

  return out;
}

const TSCONFIG_DEPRECATED: Record<string, string> = {
  charset: 'No replacement — files are always read as UTF-8.',
  keyofStringsOnly: 'Removed in TypeScript 5.5. Use the default behaviour.',
  suppressImplicitAnyIndexErrors:
    'Use "// @ts-ignore" or fix the underlying type instead.',
  suppressExcessPropertyErrors:
    'Use "// @ts-expect-error" or fix the type instead.',
  noImplicitUseStrict: 'Use the default behaviour.',
  importsNotUsedAsValues: 'Replaced by "verbatimModuleSyntax" in TS 5.0+.',
  preserveValueImports: 'Replaced by "verbatimModuleSyntax" in TS 5.0+.',
  out: 'Replaced by "outFile" — "out" is a long-deprecated alias.',
};

function lintTsconfig(source: string, root: Node): Finding[] {
  const out: Finding[] = [];
  const co = getProperty(root, 'compilerOptions');
  if (!co || co.type !== 'object') return out;

  for (const { key, property, value } of walkProperties(co)) {
    if (TSCONFIG_DEPRECATED[key]) {
      out.push(
        emit(
          source,
          'tsconfig/deprecated-option',
          'warning',
          `"${key}" is deprecated. ${TSCONFIG_DEPRECATED[key]}`,
          property,
          'tsconfig.json',
        ),
      );
    }
    // target: "es3" / "es5" are very old — flag as info
    if (key === 'target' && typeof value?.value === 'string') {
      const v = value.value.toLowerCase();
      if (v === 'es3' || v === 'es5') {
        out.push(
          emit(
            source,
            'tsconfig/old-target',
            'info',
            `compilerOptions.target "${value.value}" is very old — consider "es2020" or newer for smaller, faster output.`,
            value,
            'tsconfig.json',
          ),
        );
      }
    }
  }

  // strict: false but with stricter sub-flags is suspicious / contradictory
  const strict = getProperty(co, 'strict');
  if (strict?.value === false) {
    const hasNoImplicitAny = getProperty(co, 'noImplicitAny');
    if (hasNoImplicitAny?.value === true) {
      out.push(
        emit(
          source,
          'tsconfig/contradictory-strict',
          'info',
          'Setting "strict: false" with individual strict flags is confusing — turn on "strict" and disable specific flags only as needed.',
          strict,
          'tsconfig.json',
        ),
      );
    }
  }

  return out;
}

/** Walk the tree and report duplicate keys at every object level. */
function findDuplicateKeys(source: string, root: Node | undefined): Finding[] {
  const out: Finding[] = [];
  function visit(node: Node | undefined) {
    if (!node) return;
    if (node.type === 'object' && node.children) {
      const seen = new Map<string, Node>();
      for (const property of node.children) {
        const [keyNode] = property.children ?? [];
        if (keyNode && typeof keyNode.value === 'string') {
          if (seen.has(keyNode.value)) {
            out.push(
              emit(
                source,
                'json/duplicate-key',
                'error',
                `Duplicate key "${keyNode.value}" — the second value silently overrides the first.`,
                keyNode,
              ),
            );
          } else {
            seen.set(keyNode.value, keyNode);
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(root);
  return out;
}

export function lintJson(source: string): Finding[] {
  const out: Finding[] = [];
  const { root, errors, hasComments, hasTrailingCommas } = parseJson(source);

  for (const err of errors) out.push(parseErrorToFinding(source, err));

  // If nothing parsed, no point trying structural rules.
  if (!root) return out;

  out.push(...findDuplicateKeys(source, root));

  const { kind, jsonc } = detectKind(root);

  // In strict-JSON mode, comments and trailing commas are spec violations.
  if (!jsonc && hasComments) {
    // We can't easily attribute a specific position without re-tokenizing —
    // point at the start of the file.
    out.push({
      ruleId: 'json/comments-not-allowed',
      severity: 'warning',
      message:
        'Strict JSON does not allow comments — strip them or use a JSONC consumer.',
      docIndex: 0,
      manifestKind: kind,
      pos: { line: 1, column: 1, endLine: 1, endColumn: 2 },
    });
  }
  if (!jsonc && hasTrailingCommas) {
    out.push({
      ruleId: 'json/trailing-comma',
      severity: 'warning',
      message: 'Strict JSON does not allow trailing commas.',
      docIndex: 0,
      manifestKind: kind,
      pos: { line: 1, column: 1, endLine: 1, endColumn: 2 },
    });
  }

  if (kind === 'package.json') out.push(...lintPackageJson(source, root));
  if (kind === 'tsconfig.json') out.push(...lintTsconfig(source, root));

  return out;
}
