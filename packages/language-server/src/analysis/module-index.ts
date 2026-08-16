import type { AstNode as ParserAstNode } from "server/parser/types/ast.js";
import type { DocumentUri } from "vscode-languageserver";

import type { ModuleIndex } from "./module-info.js";
import { collectModulePreamble } from "./module-preamble.js";

/** Extracts the dependency surface of a module without performing semantic analysis. */
export function buildModuleIndex(uri: DocumentUri, ast: ParserAstNode): ModuleIndex {
    const preamble = collectModulePreamble(uri, ast);
    const base = {
        imports: preamble.imports,
    };
    return preamble.targetNamespace === undefined
        ? { ...base, kind: "main" }
        : {
              ...base,
              kind: "library",
              targetNamespace: preamble.targetNamespace,
              exports: preamble.exports,
          };
}
