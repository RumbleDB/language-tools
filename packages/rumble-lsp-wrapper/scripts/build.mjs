import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, "package.json"), "utf8"));

const args = process.argv.slice(2);
const isProdBuild = args.includes("--prod");
const forceBuild = args.includes("--force");

function addFileToHash(hash, filePath) {
    hash.update(path.relative(packageDir, filePath));
    hash.update("\0");
    hash.update(fs.readFileSync(filePath));
    hash.update("\0");
}

function addDirectoryToHash(hash, directory) {
    if (!fs.existsSync(directory)) {
        return;
    }

    for (const entry of fs
        .readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.name === ".DS_Store") {
            continue;
        }

        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            addDirectoryToHash(hash, entryPath);
        } else if (entry.isFile()) {
            addFileToHash(hash, entryPath);
        }
    }
}

function computeBuildKey() {
    const hash = crypto.createHash("sha256");
    hash.update(`revision=${packageJson.version}\0`);
    hash.update(`production=${isProdBuild}\0`);
    addFileToHash(hash, fileURLToPath(import.meta.url));
    addFileToHash(hash, path.join(packageDir, "scripts", "fetch-rumble.sh"));
    addFileToHash(hash, path.join(packageDir, "pom.xml"));
    addDirectoryToHash(hash, path.join(packageDir, "src", "main"));
    addFileToHash(hash, path.join(packageDir, "generated-resources", "rumble-build.properties"));

    const rumbleJar = fs.realpathSync(
        path.join(packageDir, "generated-resources", "rumbledb-current-jar-with-dependencies.jar"),
    );
    const rumbleJarStat = fs.statSync(rumbleJar);
    hash.update(`rumbleJar=${rumbleJar}\0${rumbleJarStat.size}\0${rumbleJarStat.mtimeMs}\0`);
    return hash.digest("hex");
}

execFileSync("sh", [path.join(packageDir, "scripts/fetch-rumble.sh")], {
    cwd: packageDir,
    stdio: "inherit",
});

const targetDir = path.join(packageDir, "target");
const cacheFile = path.join(targetDir, ".dev-build-cache.json");
const jarFile = path.join(targetDir, `rumble-lsp-wrapper-${packageJson.version}.jar`);
const runtimeClasspathFile = path.join(targetDir, "runtime-classpath.txt");
const buildKey = computeBuildKey();

if (!isProdBuild && !forceBuild && fs.existsSync(cacheFile)) {
    try {
        const cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        if (
            cache.buildKey === buildKey &&
            fs.existsSync(jarFile) &&
            fs.existsSync(runtimeClasspathFile)
        ) {
            console.log("Rumble LSP wrapper inputs are unchanged; reusing the local build.");
            process.exit(0);
        }
    } catch {
        // A partial or outdated cache file should cause a rebuild, not a build failure.
    }
}

const mvnArgs = ["-f", path.join(packageDir, "pom.xml"), "-q"];
if (isProdBuild) {
    mvnArgs.push("-Pprod");
} else {
    mvnArgs.push("-DskipTests");
}
mvnArgs.push("package", `-Drevision=${packageJson.version}`);

execFileSync("mvn", mvnArgs, {
    cwd: packageDir,
    stdio: "inherit",
});

if (!isProdBuild) {
    fs.writeFileSync(cacheFile, `${JSON.stringify({ buildKey }, null, 4)}\n`);
}
