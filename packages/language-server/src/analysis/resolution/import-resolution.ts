import type { DocumentUri, Range } from "vscode-languageserver";
import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver";

import type { SourceModuleExportDefinition } from "../model/definitions.js";
import type { ModuleImport } from "../model/module-info.js";
import type { ResolvedModuleImport } from "../model/result.js";
import type { ModuleProlog } from "./module-prolog.js";

/** A resolved import location with its module prolog, if available. */
export interface ResolvedImportTarget {
    readonly locationUri: string;
    readonly range: Range;
    readonly targetUri?: DocumentUri | undefined;
    readonly prolog?: ModuleProlog | undefined;
}

/**
 * Provides the analysis layer with access to resolved module locations and
 * their prologs. The workspace layer implements this interface,
 * backed by its document store and prolog cache.
 */
export interface ModuleProvider {
    loadImport(importerUri: DocumentUri, imported: ModuleImport): readonly ResolvedImportTarget[];
}

/** The result of resolving all imports for a single module. */
export interface ImportResolutionResult {
    readonly resolvedImports: readonly ResolvedModuleImport[];
    readonly diagnostics: readonly Diagnostic[];
    /** Document URIs this module depends on (for dependency graph tracking). */
    readonly dependencies: ReadonlySet<DocumentUri>;
}

/**
 * Resolves module imports by validating import declarations and collecting
 * exported definitions from imported library modules.
 *
 * This is a pure function: it reads from the provided {@link ModuleProvider}
 * but does not mutate any external state.
 */
export function resolveImports(
    importerUri: DocumentUri,
    prolog: ModuleProlog,
    provider: ModuleProvider,
): ImportResolutionResult {
    const resolvedImports: ResolvedModuleImport[] = [];
    const diagnostics: Diagnostic[] = [];
    const importedNamespaces = new Set<string>();
    const dependencies = new Set<DocumentUri>();

    for (const imported of prolog.imports) {
        if (imported.namespaceUri.length === 0) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0088",
                message: "A module import target namespace cannot be empty.",
                range: imported.namespaceUriRange,
            });
            continue;
        }
        if (imported.prefix === "xml" || imported.prefix === "xmlns") {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0070",
                message: `Prefix '${imported.prefix}' cannot be used for a module import.`,
                range: imported.range,
            });
            continue;
        }
        if (importedNamespaces.has(imported.namespaceUri)) {
            diagnostics.push({
                severity: DiagnosticSeverity.Error,
                code: "XQST0047",
                message: `Module namespace '${imported.namespaceUri}' is imported more than once.`,
                range: imported.namespaceUriRange,
            });
            continue;
        }
        importedNamespaces.add(imported.namespaceUri);

        const exports = new Map<string, SourceModuleExportDefinition>();
        let foundValidModule = false;
        for (const target of provider.loadImport(importerUri, imported)) {
            if (target.targetUri !== undefined) dependencies.add(target.targetUri);
            if (target.prolog === undefined) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    code: "XQST0059",
                    message: `Cannot resolve module location '${target.locationUri}'.`,
                    range: target.range,
                });
                continue;
            }
            if (
                target.prolog.targetNamespace === undefined ||
                target.prolog.targetNamespace !== imported.namespaceUri
            ) {
                diagnostics.push({
                    severity: DiagnosticSeverity.Error,
                    code: "XQST0059",
                    message: `Imported module must declare namespace '${imported.namespaceUri}'.`,
                    range: target.range,
                });
                continue;
            }
            foundValidModule = true;
            for (const [name, exported] of target.prolog.exports) {
                if (exports.has(name)) {
                    diagnostics.push({
                        severity: DiagnosticSeverity.Error,
                        code:
                            exported.kind === "variable"
                                ? "XQST0049"
                                : exported.kind === "function"
                                  ? "XQST0034"
                                  : "duplicate-type",
                        message: `Module export '${name}' is defined more than once.`,
                        range: target.range,
                    });
                    continue;
                }
                exports.set(name, exported);
            }
        }
        if (foundValidModule) {
            resolvedImports.push({
                targetNamespaceUri: imported.namespaceUri,
                exports,
            });
        }
    }

    return { resolvedImports, diagnostics, dependencies };
}
