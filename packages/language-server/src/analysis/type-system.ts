import { QNameToString, type FunctionName, type QName } from "./names.js";

export interface NamedTypeDefinition {
    kind: "named";
    name?: QName;
}

export interface ObjectTypeDefinition {
    kind: "object";
    name?: QName;
    fields: Record<string, TypeDefinition>;
}

export interface ArrayTypeDefinition {
    kind: "array";
    name?: QName;
}

export type TypeDefinition = NamedTypeDefinition | ObjectTypeDefinition | ArrayTypeDefinition;

export interface SequenceType {
    itemType: TypeDefinition;
    arity: string;
}

export interface StaticFunctionParameter {
    name?: FunctionName;
    type: SequenceType;
}

export interface StaticFunctionSignature {
    parameterTypes: StaticFunctionParameter[];
    returnType: SequenceType;
}

export function formatTypeDefinition(type: TypeDefinition): string {
    if (type.kind === "object") {
        const fields = Object.entries(type.fields)
            .map(([name, fieldType]) => `${name}: ${formatTypeDefinition(fieldType)}`)
            .join(", ");
        return `{ ${fields} }`;
    }

    return type.name === undefined ? "anonymous type" : QNameToString(type.name, false);
}

export function formatSequenceType(type: SequenceType): string {
    return `${formatTypeDefinition(type.itemType)}${type.arity}`;
}
