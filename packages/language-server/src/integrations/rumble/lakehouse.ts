import type { InitializationOptions, SparkConfValue } from "server/app/configuration.js";

type WrapperConfiguration = InitializationOptions["wrapper"];

const SPARK_EXTENSIONS = "spark.sql.extensions";
const SESSION_CATALOG = "spark.sql.catalog.spark_catalog";

const DELTA_EXTENSION = "io.delta.sql.DeltaSparkSessionExtension";
const DELTA_CATALOG = "org.apache.spark.sql.delta.catalog.DeltaCatalog";

/**
 * The Spark properties for the wrapper: those of the enabled lakehouse formats, then `sparkConf`.
 * A `sparkConf` property replaces a format's, except `spark.sql.extensions`, whose lists are joined
 * so that a user's extension does not silently drop a format's.
 */
export function buildSparkConf(wrapper: WrapperConfiguration): Record<string, SparkConfValue> {
    const formats = wrapper.lakehouseFormats ?? {};
    const conf: Record<string, SparkConfValue> = {};
    const extensions: string[] = [];

    if (formats.delta === true) {
        extensions.push(DELTA_EXTENSION);
        conf[SESSION_CATALOG] = DELTA_CATALOG;
    }

    for (const [key, value] of Object.entries(wrapper.sparkConf ?? {})) {
        if (key === SPARK_EXTENSIONS) {
            extensions.push(...String(value).split(","));
        } else {
            conf[key] = value;
        }
    }

    const uniqueExtensions = [...new Set(extensions.map((name) => name.trim()).filter(Boolean))];
    if (uniqueExtensions.length > 0) conf[SPARK_EXTENSIONS] = uniqueExtensions.join(",");
    return conf;
}
