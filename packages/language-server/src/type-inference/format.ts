import { QNameToString } from "server/analysis/names.js";
import { type InferredType } from "server/wrapper/types.js";

export function formatInferredType(type: InferredType): string {
    if ("function" in type) {
        const parameterTypes = type.function.signature.parameterTypes.map((parameter, index) => {
            const name =
                parameter.name === null
                    ? `$arg${index + 1}`
                    : `$${QNameToString(parameter.name.qname, false)}`;
            return `${name}: ${parameter.type}`;
        });
        return `(${parameterTypes.join(", ")}) => ${type.function.signature.returnType}`;
    }

    return type.sequenceType;
}
