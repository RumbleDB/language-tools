#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WRAPPER_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

RUMBLE_DIR="$WRAPPER_DIR/rumbledb"

WRAPPER_TARGET_DIR="$WRAPPER_DIR/target"
WRAPPER_GENERATED_RESOURCES_DIR="$WRAPPER_DIR/generated-resources"
WRAPPER_CLASSES_DIR="$WRAPPER_TARGET_DIR/classes"

WRAPPER_METADATA_FILE="$WRAPPER_GENERATED_RESOURCES_DIR/rumble-build.properties"
WRAPPER_COMPILED_METADATA_FILE="$WRAPPER_CLASSES_DIR/rumble-build.properties"
WRAPPER_BUILD_STAMP="$WRAPPER_GENERATED_RESOURCES_DIR/rumble-build.stamp"

RUMBLE_REPO_URL="https://github.com/RumbleDB/rumble.git"
RUMBLE_REQUESTED_COMMIT="939a4769f2e20fb54a7c576a9fa11c08df2ea8e6"
RUMBLE_TARGET_DIR="$RUMBLE_DIR/target"
RUMBLE_BUILD_CACHE_DIR="$WRAPPER_DIR/.cache/rumble/$RUMBLE_REQUESTED_COMMIT"
# Maven reads this on every run, so the wrapper depends on whatever version the pinned commit declares.
WRAPPER_MAVEN_CONFIG="$WRAPPER_DIR/.mvn/maven.config"

ensure_rumble_checkout() {
    if [ ! -d "$RUMBLE_DIR" ]; then
        echo "Initializing Rumble repository from $RUMBLE_REPO_URL..." >&2
        git init "$RUMBLE_DIR" >/dev/null
        git -C "$RUMBLE_DIR" remote add origin "$RUMBLE_REPO_URL"
        echo "Fetching Rumble commit $RUMBLE_REQUESTED_COMMIT..." >&2
        git -C "$RUMBLE_DIR" fetch --depth 1 origin "$RUMBLE_REQUESTED_COMMIT"
        git -C "$RUMBLE_DIR" checkout --detach FETCH_HEAD >/dev/null
        return
    fi

    if [ ! -e "$RUMBLE_DIR/.git" ]; then
        echo "Expected a git checkout at $RUMBLE_DIR" >&2
        exit 1
    fi

    if [ "$(git -C "$RUMBLE_DIR" rev-parse HEAD)" = "$RUMBLE_REQUESTED_COMMIT" ]; then
        return
    fi

    # A checkout on a branch is being worked on, so it is left as it is.
    current_branch=$(git -C "$RUMBLE_DIR" branch --show-current)
    if [ -n "$current_branch" ]; then
        echo "Warning: using Rumble branch $current_branch rather than the pinned commit $RUMBLE_REQUESTED_COMMIT." >&2
        return
    fi

    echo "Updating Rumble to commit $RUMBLE_REQUESTED_COMMIT..." >&2
    git -C "$RUMBLE_DIR" fetch --depth 1 origin "$RUMBLE_REQUESTED_COMMIT"
    git -C "$RUMBLE_DIR" -c advice.detachedHead=false checkout --detach FETCH_HEAD >/dev/null
    # A jar from before the move is stale, even if no build stamp says so.
    remove_rumble_jars
}

# Rumble's thin jar, without the -tests, -sources, -javadoc or -jar-with-dependencies variants.
list_rumble_jars() {
    ls -1t "$1"/rumbledb-*.jar 2>/dev/null | grep -E '/rumbledb-[0-9][^/]*\.jar$' | grep -vE -- '-(tests|sources|javadoc|jar-with-dependencies)\.jar$' || true
}

remove_rumble_jars() {
    list_rumble_jars "$RUMBLE_TARGET_DIR" | while IFS= read -r jar; do rm -f "$jar"; done
}

detect_rumble_ref() {
    current_ref=$(git -C "$RUMBLE_DIR" branch --show-current 2>/dev/null || true)
    if [ -n "$current_ref" ]; then
        printf '%s\n' "$current_ref"
        return
    fi

    printf 'detached\n'
}

write_metadata_file() {
    metadata_file=$1
    rumble_version=""
    if [ -n "$RUMBLE_JAR" ]; then
        rumble_version=$(extract_rumble_version_from_jar "$RUMBLE_JAR")
    fi
    mkdir -p "$(dirname "$metadata_file")"
    cat >"$metadata_file" <<EOF
rumble.repoUrl=$RUMBLE_REPO_URL
rumble.requestedCommit=$RUMBLE_REQUESTED_COMMIT
rumble.currentRef=$RUMBLE_CURRENT_REF
rumble.version=$rumble_version
rumble.commit=$RUMBLE_COMMIT
rumble.commitShort=$RUMBLE_COMMIT_SHORT
rumble.jar=$RUMBLE_JAR
EOF
}

build_signature() {
    cat <<EOF
commit=$RUMBLE_COMMIT
jar=$RUMBLE_JAR
EOF
}

stamp_commit_matches_checkout() {
    if [ ! -f "$WRAPPER_BUILD_STAMP" ]; then
        return 1
    fi

    stamp_commit=$(sed -n 's/^commit=//p' "$WRAPPER_BUILD_STAMP")
    [ "$stamp_commit" = "$RUMBLE_COMMIT" ]
}

resolve_rumble_jar() {
    jar_path=$(list_rumble_jars "$RUMBLE_TARGET_DIR" | head -n 1)
    if [ -z "$jar_path" ]; then
        jar_path=$(list_rumble_jars "$RUMBLE_BUILD_CACHE_DIR" | head -n 1)
    fi
    if [ -z "$jar_path" ]; then
        return 1
    fi

    printf '%s\n' "$jar_path"
}

cache_rumble_jar() {
    if [ "${CI:-}" != "true" ]; then
        return
    fi

    mkdir -p "$RUMBLE_BUILD_CACHE_DIR"
    cached_jar="$RUMBLE_BUILD_CACHE_DIR/$(basename "$RUMBLE_JAR")"
    if [ "$RUMBLE_JAR" != "$cached_jar" ] && [ ! -f "$cached_jar" ]; then
        ln -f "$RUMBLE_JAR" "$cached_jar" 2>/dev/null || cp -p "$RUMBLE_JAR" "$cached_jar"
    fi
}

extract_rumble_version_from_jar() {
    jar_file=$(basename "$1")
    version=${jar_file#rumbledb-}
    version=${version%.jar}
    printf '%s\n' "$version"
}

# Installs the jar with Rumble's own pom, so that Maven resolves its dependencies transitively.
# This runs on every build: ~/.m2 may hold a 3.1.0 installed from another commit (for example from the CI cache).
install_rumble_jar() {
    rumble_version=$(extract_rumble_version_from_jar "$RUMBLE_JAR")
    (cd "$RUMBLE_DIR" && mvn -q install:install-file -Dfile="$RUMBLE_JAR" -DpomFile=pom.xml)
    mkdir -p "$(dirname "$WRAPPER_MAVEN_CONFIG")"
    printf -- '-Drumble.version=%s\n' "$rumble_version" >"$WRAPPER_MAVEN_CONFIG"
    echo "Installed Rumble $rumble_version into the local Maven repository" >&2
}

ensure_rumble_checkout

RUMBLE_COMMIT=$(git -C "$RUMBLE_DIR" rev-parse HEAD)
RUMBLE_COMMIT_SHORT=$(git -C "$RUMBLE_DIR" rev-parse --short HEAD)
RUMBLE_CURRENT_REF=$(detect_rumble_ref)
# The jar was built from another commit, so it must not be used for this one.
if [ -f "$WRAPPER_BUILD_STAMP" ] && ! stamp_commit_matches_checkout; then
    remove_rumble_jars
fi
RUMBLE_JAR=$(resolve_rumble_jar 2>/dev/null || true)
if [ -n "$RUMBLE_JAR" ]; then
    cache_rumble_jar
fi
CURRENT_BUILD_SIGNATURE=$(build_signature)

write_metadata_file "$WRAPPER_METADATA_FILE"
if [ -d "$WRAPPER_CLASSES_DIR" ]; then
    write_metadata_file "$WRAPPER_COMPILED_METADATA_FILE"
fi

if [ -z "$RUMBLE_JAR" ]; then
    echo "Building Rumble from source..." >&2
    # maven.test.skip also skips the -tests jar; javadoc and sources jars are not needed either.
    (cd "$RUMBLE_DIR" && mvn -q -Dmaven.test.skip -Dmaven.javadoc.skip -Dmaven.source.skip clean package)
    RUMBLE_JAR=$(resolve_rumble_jar)
    cache_rumble_jar
    CURRENT_BUILD_SIGNATURE=$(build_signature)
elif [ ! -f "$WRAPPER_BUILD_STAMP" ]; then
    echo "Adopting existing Rumble jar for commit $RUMBLE_COMMIT_SHORT..." >&2
fi

install_rumble_jar
write_metadata_file "$WRAPPER_METADATA_FILE"
if [ -d "$WRAPPER_CLASSES_DIR" ]; then
    write_metadata_file "$WRAPPER_COMPILED_METADATA_FILE"
fi
printf '%s' "$CURRENT_BUILD_SIGNATURE" >"$WRAPPER_BUILD_STAMP"

echo "Prepared Rumble $(extract_rumble_version_from_jar "$RUMBLE_JAR") at commit $RUMBLE_COMMIT_SHORT ($RUMBLE_CURRENT_REF)." >&2
