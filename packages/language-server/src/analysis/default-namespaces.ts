const LOCAL_NAMESPACE = "http://www.w3.org/2005/xquery-local-functions";
const FN_NAMESPACE = "http://www.w3.org/2005/xpath-functions";
const MATH_NAMESPACE = "http://www.w3.org/2005/xpath-functions/math";
const MAP_NAMESPACE = "http://www.w3.org/2005/xpath-functions/map";
const ARRAY_NAMESPACE = "http://www.w3.org/2005/xpath-functions/array";
const XS_NAMESPACE = "http://www.w3.org/2001/XMLSchema";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
const JN_NAMESPACE = "http://jsoniq.org/functions";
const JS_NAMESPACE = "http://jsoniq.org/types";
const ERR_NAMESPACE = "http://www.w3.org/2005/xqt-errors";

export {
    LOCAL_NAMESPACE,
    FN_NAMESPACE,
    MATH_NAMESPACE,
    MAP_NAMESPACE,
    ARRAY_NAMESPACE,
    XS_NAMESPACE,
    XML_NAMESPACE,
    JN_NAMESPACE,
    JS_NAMESPACE,
    ERR_NAMESPACE,
};

export const defaultNamespaces: Map<string, string> = new Map([
    ["local", LOCAL_NAMESPACE],
    ["fn", FN_NAMESPACE],
    ["math", MATH_NAMESPACE],
    ["map", MAP_NAMESPACE],
    ["array", ARRAY_NAMESPACE],
    ["xs", XS_NAMESPACE],
    ["xml", XML_NAMESPACE],
    ["jn", JN_NAMESPACE],
    ["js", JS_NAMESPACE],
    ["err", ERR_NAMESPACE],
]);
