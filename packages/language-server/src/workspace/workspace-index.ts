import type {
    SchemaCatalogInput,
    SchemaCatalogWireResult,
} from "server/integrations/rumble/operations/schema-catalog/protocol.js";
import { ParserService } from "server/parser/index.js";
import { getActiveParserId } from "server/parser/utils.js";
import { resolveBuiltin } from "server/resources/builtins.js";
import { createLogger } from "server/utils/logger.js";
import type { DocumentUri } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { FileChangeType, type FileEvent } from "vscode-languageserver/node";

import type {
    Definition,
    SchemaConstructorDefinition,
    SchemaTypeDefinition,
} from "../analysis/model/definitions.js";
import type { ModuleImport } from "../analysis/model/module-info.js";
import type { AnyResolvedReference } from "../analysis/model/reference.js";
import type { AnalysisResult } from "../analysis/model/result.js";
import { analyzeModule } from "../analysis/pipeline.js";
import type {
    ModuleProvider,
    ResolvedImportTarget,
} from "../analysis/resolution/import-resolution.js";
import { collectModuleProlog, type ModuleProlog } from "../analysis/resolution/module-prolog.js";
import { WorkspaceDocumentStore } from "./document-store.js";
import { ModuleGraph } from "./module-graph.js";
import { resolveModuleLocations } from "./module-resolver.js";
import { WorkspaceSymbolIndex } from "./symbol-index.js";

interface CachedAnalysis {
    version: number;
    analysis: Promise<AnalysisResult>;
}

interface CachedProlog {
    version: number;
    prolog: ModuleProlog;
}

interface CachedSchemaCatalog {
    key: string;
    catalog: Promise<SchemaCatalogWireResult | undefined>;
}

const logger = createLogger("workspace-analysis");

export class WorkspaceIndex {
    private readonly moduleGraph = new ModuleGraph();
    private readonly symbols = new WorkspaceSymbolIndex();
    private readonly analyses = new Map<DocumentUri, CachedAnalysis>();
    private readonly prologs = new Map<DocumentUri, CachedProlog>();
    private readonly schemaCatalogs = new Map<DocumentUri, CachedSchemaCatalog>();
    private readonly failedAnalyses = new Set<DocumentUri>();

    public constructor(
        private readonly parser: ParserService,
        private readonly documents: WorkspaceDocumentStore = new WorkspaceDocumentStore(),
        private readonly loadSchemaCatalog: (
            uri: DocumentUri,
            input: SchemaCatalogInput,
        ) => Promise<SchemaCatalogWireResult | undefined> = async () => undefined,
    ) {}

    public updateOpenDocument(document: TextDocument): void {
        const snapshot = TextDocument.create(
            document.uri,
            document.languageId,
            document.version,
            document.getText(),
        );
        if (!this.documents.updateOpenDocument(snapshot)) return;
        this.invalidateAffected([document.uri]);
    }

    public removeOpenDocument(uri: DocumentUri): void {
        this.schemaCatalogs.delete(uri);
        if (!this.documents.removeOpenDocument(uri)) return;
        this.invalidateAffected([uri]);
    }

    public getAnalysis(document: TextDocument): Promise<AnalysisResult> {
        this.updateOpenDocument(document);
        return this.analyse(this.documents.load(document.uri)!);
    }

    public replaceWorkspaceDocuments(uris: readonly DocumentUri[]): void {
        this.failedAnalyses.clear();
        const removedDocuments = this.documents.replaceWorkspaceDocuments(uris);
        logger.debug("Tracked documents:", this.documents.getTrackedDocumentUris());
        for (const uri of removedDocuments) {
            this.parser.clear(uri);
            this.schemaCatalogs.delete(uri);
        }
        this.invalidateAffected(removedDocuments);
        for (const uri of removedDocuments) {
            this.moduleGraph.removeOutgoingDependencies(uri);
        }
    }

    public updateWorkspaceDocuments(changes: readonly FileEvent[]): ReadonlySet<DocumentUri> {
        const changedUris = changes.map((change) => change.uri);
        for (const uri of changedUris) this.parser.clear(uri);
        const affected = this.invalidateAffected(changedUris);

        // Disk changes can alter schema contents without changing the catalog request key.
        for (const uri of affected) this.schemaCatalogs.delete(uri);

        this.documents.updateWorkspaceDocuments(changes);
        logger.debug("Tracked documents:", this.documents.getTrackedDocumentUris());
        for (const change of changes) {
            if (change.type === FileChangeType.Deleted) {
                this.moduleGraph.removeOutgoingDependencies(change.uri);
            }
        }
        return affected;
    }

    private async analyse(document: TextDocument): Promise<AnalysisResult> {
        const cached = this.analyses.get(document.uri);
        if (cached?.version === document.version) return cached.analysis;

        // Capture syntax and imports before yielding to document changes.
        const ast = this.parser.parse(document).ast;
        const prolog = this.getProlog(document);
        const { provider, dependencies } = this.prepareImports(document, prolog);

        // Register pending catalogs before yielding, so close/reopen also invalidates them.
        const pendingCatalog = this.getSchemaCatalog(document.uri, prolog);

        // Keep known schema dependencies while loading their replacement catalog.
        // File changes must invalidate pending analysis as well as completed analysis.
        this.moduleGraph.addDependencies(document.uri, dependencies);
        const entry: CachedAnalysis = {
            version: document.version,
            analysis: Promise.resolve().then(async () => {
                const catalog = await pendingCatalog;
                const schemaConstructors: SchemaConstructorDefinition[] = (
                    catalog?.constructors ?? []
                ).map((constructor) => ({
                    ...constructor,
                    kind: "function",
                    origin: "schema",
                }));
                const language = getActiveParserId(document);
                const schemaTypes: SchemaTypeDefinition[] = (catalog?.types ?? []).map((name) => ({
                    name,
                    kind: "type",
                    origin: "schema",
                }));
                const { analysis } = analyzeModule(document, ast, {
                    provider,
                    prolog,
                    schemaConstructors,
                    schemaTypes,
                    resolveBuiltin: (kind, name) => resolveBuiltin(kind, name, language),
                });
                if (this.analyses.get(document.uri) === entry) {
                    // Rumble knows the nested imports/includes, including files it failed to read.
                    const allDependencies = new Set(dependencies);

                    // Add nested schema dependencies from the catalog
                    for (const uri of catalog?.dependencies ?? []) {
                        const dependency = new URL(uri);
                        if (dependency.protocol === "file:") {
                            // Java's file:/path and VSCode's file:///path must share a graph key.
                            allDependencies.add(dependency.href);
                        }
                    }

                    this.moduleGraph.replaceDependencies(document.uri, allDependencies);
                    // Let a subsequent request retry even when the document version is unchanged.
                    if (prolog.schemaImports.length > 0 && catalog === undefined) {
                        this.analyses.delete(document.uri);
                    }
                    this.failedAnalyses.delete(document.uri);
                    this.symbols.update(document.uri, analysis);
                }
                return analysis;
            }),
        };
        this.analyses.set(document.uri, entry);
        try {
            return await entry.analysis;
        } catch (error) {
            if (this.analyses.get(document.uri) === entry) this.analyses.delete(document.uri);
            throw error;
        }
    }

    private getSchemaCatalog(
        uri: DocumentUri,
        prolog: ModuleProlog,
    ): Promise<SchemaCatalogWireResult | undefined> {
        if (prolog.schemaImports.length === 0) {
            this.schemaCatalogs.delete(uri);
            return Promise.resolve(undefined);
        }

        const input: SchemaCatalogInput = {
            imports: prolog.schemaImports.map((imported) => ({
                namespaceUri: imported.namespaceUri,
                locations: imported.locations.map((location) => location.uri),
            })),
            ...(prolog.baseUri === undefined ? {} : { baseUri: prolog.baseUri }),
        };

        // The URI is the map key; query text and prefix aliases do not affect this key.
        const key = JSON.stringify(input);
        const cached = this.schemaCatalogs.get(uri);
        if (cached?.key === key) return cached.catalog;

        const entry: CachedSchemaCatalog = {
            key,
            catalog: Promise.resolve()
                .then(() => this.loadSchemaCatalog(uri, input))
                .catch((error: unknown) => {
                    logger.warn(`Could not load schema catalog for '${uri}'.`, error);
                    return undefined;
                })
                .then((catalog) => {
                    if (catalog === undefined && this.schemaCatalogs.get(uri) === entry) {
                        this.schemaCatalogs.delete(uri);
                    }
                    return catalog;
                }),
        };

        this.schemaCatalogs.set(uri, entry);
        return entry.catalog;
    }

    private prepareImports(
        document: TextDocument,
        prolog: ModuleProlog,
    ): { provider: ModuleProvider; dependencies: ReadonlySet<DocumentUri> } {
        const resolvedTargets = new Map<ModuleImport, readonly ResolvedImportTarget[]>();
        const dependencies = new Set<DocumentUri>();
        for (const imported of prolog.imports) {
            const targets = this.documents.loadImport(document, imported);
            resolvedTargets.set(
                imported,
                targets.map((loaded) => {
                    if (loaded.targetUri !== undefined) dependencies.add(loaded.targetUri);
                    return {
                        locationUri: loaded.locationUri,
                        range: loaded.range,
                        targetUri: loaded.targetUri,
                        prolog:
                            loaded.document === undefined
                                ? undefined
                                : this.getProlog(loaded.document),
                    };
                }),
            );
        }
        // Track direct local schema locations without parsing XSD files as query modules.
        try {
            const baseUri = new URL(prolog.baseUri ?? document.uri, document.uri).toString();
            for (const imported of prolog.schemaImports) {
                for (const location of resolveModuleLocations(baseUri, imported)) {
                    if (location.targetUri?.startsWith("file:")) {
                        dependencies.add(location.targetUri);
                    }
                }
            }
        } catch {
            // Rumble reports invalid base URIs when loading the schema catalog.
        }
        return {
            provider: { loadImport: (_uri, imported) => resolvedTargets.get(imported) ?? [] },
            dependencies,
        };
    }

    private getProlog(document: TextDocument): ModuleProlog {
        const cached = this.prologs.get(document.uri);
        if (cached?.version === document.version) return cached.prolog;

        const prolog = collectModuleProlog(document.uri, this.parser.parse(document).ast);
        this.prologs.set(document.uri, { version: document.version, prolog });
        return prolog;
    }

    public async getReferencesToDefinition(
        definition: Definition,
    ): Promise<readonly AnyResolvedReference[]> {
        if (definition.origin !== "source") return [];

        await this.ensureDocumentsAnalysed(this.documents.getTrackedDocumentUris());

        return this.symbols.referencesTo(definition);
    }

    private async ensureDocumentsAnalysed(uris: readonly DocumentUri[]): Promise<void> {
        const pending = new Set(uris);
        for (const uri of pending) {
            if (this.failedAnalyses.has(uri)) continue;
            try {
                const document = this.documents.load(uri);
                if (document === undefined) {
                    this.failedAnalyses.add(uri);
                    continue;
                }
                await this.analyse(document);
                // Imported modules may be outside the scanned workspace folders.
                for (const imported of this.getProlog(document).imports) {
                    for (const target of this.documents.loadImport(document, imported)) {
                        if (target.document !== undefined) pending.add(target.document.uri);
                    }
                }
            } catch (error) {
                this.failedAnalyses.add(uri);
                logger.warn(`Could not index workspace document '${uri}'.`, error);
            }
        }
    }

    private invalidateAffected(uris: readonly DocumentUri[]): ReadonlySet<DocumentUri> {
        const affected = this.moduleGraph.affectedBy(uris);
        for (const uri of affected) {
            this.analyses.delete(uri);
            this.failedAnalyses.delete(uri);
            this.symbols.remove(uri);
        }
        for (const uri of uris) this.prologs.delete(uri);
        return affected;
    }
}
