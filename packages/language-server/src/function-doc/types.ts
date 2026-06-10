export interface Parameter {
    name: string;
    type: string;
    default?: string;
    usage?: string;
}

export interface Signature {
    params: Parameter[];
    returnType: string;
}

export interface FunctionEntry {
    name: string;
    prefix: string;
    summary: string;
    rules?: string;
    errors?: string;
    notes?: string;
    examples?: string;
    properties?: string[];
    signatures: Signature[];
}
