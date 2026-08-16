import {
    isPrefixedQName,
    isUriQualifiedQName,
    type LexicalFunctionName,
    type LexicalQName,
    type Prefix,
} from "server/parser/types/name.js";
import { DiagnosticSeverity, type Diagnostic, type Range } from "vscode-languageserver";

import type { NamespaceDefinition } from "./definitions.js";
import type { FunctionName, QName } from "./names.js";

export class NamespaceResolver {
    public constructor(
        private readonly namespaces: ReadonlyMap<Prefix, NamespaceDefinition>,
        private readonly reportDiagnostic: (diagnostic: Diagnostic) => void,
    ) {}

    public resolveFunctionName(name: LexicalFunctionName, range: Range): FunctionName {
        return { ...name, qname: this.resolveQName(name.qname, range) };
    }

    public resolveQName(qname: LexicalQName, range: Range): QName {
        const namespaceUri = isUriQualifiedQName(qname)
            ? qname.namespaceUri
            : isPrefixedQName(qname)
              ? this.namespaces.get(qname.prefix)?.namespaceUri
              : undefined;

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
}
