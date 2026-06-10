import type { QName } from "../analysis/names.js";

export interface WrapperResolvedQName {
    localName: string;
    namespaceUri?: string | null;
    prefix: string | null;
}

export function toResolvedQName(name: WrapperResolvedQName): QName {
    return {
        localName: name.localName,
        ...(name.namespaceUri === null ? {} : { namespaceUri: name.namespaceUri }),
        ...(name.prefix === null ? {} : { prefix: name.prefix }),
    };
}
