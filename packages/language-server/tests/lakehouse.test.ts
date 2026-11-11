import { buildSparkConf } from "server/integrations/rumble/lakehouse.js";
import { describe, expect, it } from "vitest";

const DELTA_EXTENSION = "io.delta.sql.DeltaSparkSessionExtension";
const DELTA_CATALOG = "org.apache.spark.sql.delta.catalog.DeltaCatalog";

describe("buildSparkConf", () => {
    it("is empty without formats or properties", () => {
        expect(buildSparkConf({ enabled: true })).toEqual({});
        expect(buildSparkConf({ enabled: true, lakehouseFormats: { delta: false } })).toEqual({});
    });

    it("configures Delta", () => {
        expect(buildSparkConf({ enabled: true, lakehouseFormats: { delta: true } })).toEqual({
            "spark.sql.extensions": DELTA_EXTENSION,
            "spark.sql.catalog.spark_catalog": DELTA_CATALOG,
        });
    });

    it("joins extensions from sparkConf and lets other properties override", () => {
        const conf = buildSparkConf({
            enabled: true,
            lakehouseFormats: { delta: true },
            sparkConf: {
                "spark.sql.extensions": `my.Extension, ${DELTA_EXTENSION}`,
                "spark.sql.catalog.spark_catalog": "my.Catalog",
                "spark.executor.memory": "4g",
            },
        });
        expect(conf["spark.sql.extensions"]).toBe(`${DELTA_EXTENSION},my.Extension`);
        expect(conf["spark.sql.catalog.spark_catalog"]).toBe("my.Catalog");
        expect(conf["spark.executor.memory"]).toBe("4g");
    });
});
