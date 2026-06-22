import { QNameToString } from "server/analysis/names.js";

import { formatSequenceType, type StaticType } from "./types.js";

export function formatStaticType(type: StaticType): string {
    if ("function" in type) {
        const parameterTypes = type.function.signature.parameterTypes.map((parameter, index) => {
            const name =
                parameter.name === undefined
                    ? `$arg${index + 1}`
                    : `$${QNameToString(parameter.name.qname, false)}`;
            return `${name}: ${formatSequenceType(parameter.type)}`;
        });
        return `(${parameterTypes.join(", ")}) => ${formatSequenceType(type.function.signature.returnType)}`;
    }

    return formatSequenceType(type.sequenceType);
}
