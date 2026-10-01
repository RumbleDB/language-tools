import {
    isPrefixedQName,
    isUriQualifiedQName,
    type LexicalFunctionName,
    type LexicalQName,
    type Prefix,
} from "server/parser/types/name.js";
import { DiagnosticSeverity, type Diagnostic, type Range } from "vscode-languageserver";

import { DEFAULT_NAMESPACES } from "../model/constants.js";
import type { SourceNamespaceDefinition } from "../model/definitions.js";
import type { FunctionName, QName } from "../model/names.js";

export class NamespaceResolver {
    public constructor(
        private readonly namespaces: ReadonlyMap<Prefix, SourceNamespaceDefinition>,
        private readonly reportDiagnostic: (diagnostic: Diagnostic) => void,
        private readonly defaultElementTypeNamespace?: string,
    ) {}

    public getNamespaces(): ReadonlyMap<Prefix, string> {
        const namespaces = new Map<Prefix, string>();
        for (const prefix of [...DEFAULT_NAMESPACES.keys(), ...this.namespaces.keys()]) {
            const namespaceUri = this.resolveNamespaceUri(prefix);
            if (namespaceUri !== undefined) namespaces.set(prefix, namespaceUri);
        }
        return namespaces;
    }

    public resolveFunctionName(
        name: LexicalFunctionName,
        range: Range,
        defaultFunctionNamespace?: string,
    ): FunctionName {
        return { ...name, qname: this.resolveQName(name.qname, range, defaultFunctionNamespace) };
    }

    public resolveTypeName(name: LexicalQName, range: Range): QName {
        // The default element/type namespace applies only to unprefixed type names.
        return this.resolveQName(name, range, this.defaultElementTypeNamespace);
    }

    public resolveQName(qname: LexicalQName, range: Range, defaultNamespace?: string): QName {
        const namespaceUri = isUriQualifiedQName(qname)
            ? qname.namespaceUri
            : isPrefixedQName(qname)
              ? this.resolveNamespaceUri(qname.prefix)
              : defaultNamespace;

        if (namespaceUri === undefined && isPrefixedQName(qname)) {
            this.reportDiagnostic({
                severity: DiagnosticSeverity.Warning,
                message: `Undefined namespace prefix '${qname.prefix}'`,
                range,
                code: "undefined-namespace-prefix",
            });
        }

        return {
            localName: qname.localName,
            ...(namespaceUri === undefined ? {} : { namespaceUri }),
            ...(isPrefixedQName(qname) ? { prefix: qname.prefix } : {}),
        };
    }

    private resolveNamespaceUri(prefix: Prefix): string | undefined {
        return this.namespaces.get(prefix)?.namespaceUri ?? DEFAULT_NAMESPACES.get(prefix);
    }
}
