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
WRAPPER_RUMBLE_JAR_LINK="$WRAPPER_GENERATED_RESOURCES_DIR/rumbledb-current-jar-with-dependencies.jar"
WRAPPER_BUILD_STAMP="$WRAPPER_GENERATED_RESOURCES_DIR/rumble-build.stamp"

RUMBLE_REPO_URL="https://github.com/RumbleDB/rumble.git"
RUMBLE_REQUESTED_REF="master"
RUMBLE_REQUESTED_COMMIT="b71e18723464414f1a2c709eacc09409832d5766"
RUMBLE_TARGET_DIR="$RUMBLE_DIR/target"

ensure_rumble_checkout() {
    if [ ! -d "$RUMBLE_DIR" ]; then
        echo "Initializing Rumble repository from $RUMBLE_REPO_URL..." >&2
        git init "$RUMBLE_DIR" >/dev/null
        git -C "$RUMBLE_DIR" remote add origin "$RUMBLE_REPO_URL"
        echo "Fetching Rumble commit $RUMBLE_REQUESTED_COMMIT (ref: $RUMBLE_REQUESTED_REF)..." >&2
        git -C "$RUMBLE_DIR" fetch --depth 1 origin "$RUMBLE_REQUESTED_COMMIT"
        git -C "$RUMBLE_DIR" checkout --detach FETCH_HEAD >/dev/null
        return
    fi

    if [ ! -e "$RUMBLE_DIR/.git" ]; then
        echo "Expected a git checkout at $RUMBLE_DIR" >&2
        exit 1
    fi
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
rumble.requestedRef=$RUMBLE_REQUESTED_REF
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
    jar_path=$(ls -1t "$RUMBLE_TARGET_DIR"/rumbledb-*-jar-with-dependencies.jar 2>/dev/null | head -n 1 || true)
    if [ -z "$jar_path" ]; then
        return 1
    fi

    printf '%s\n' "$jar_path"
}

extract_rumble_version_from_jar() {
    jar_file=$(basename "$1")
    version=${jar_file#rumbledb-}
    version=${version%-jar-with-dependencies.jar}
    printf '%s\n' "$version"
}

update_rumble_jar_link() {
    mkdir -p "$WRAPPER_GENERATED_RESOURCES_DIR"
    ln -sf "$RUMBLE_JAR" "$WRAPPER_RUMBLE_JAR_LINK"
    echo "Linked Rumble jar to $WRAPPER_RUMBLE_JAR_LINK" >&2
}

ensure_rumble_checkout

RUMBLE_COMMIT=$(git -C "$RUMBLE_DIR" rev-parse HEAD)
RUMBLE_COMMIT_SHORT=$(git -C "$RUMBLE_DIR" rev-parse --short HEAD)
RUMBLE_CURRENT_REF=$(detect_rumble_ref)
RUMBLE_JAR=$(resolve_rumble_jar 2>/dev/null || true)
CURRENT_BUILD_SIGNATURE=$(build_signature)

write_metadata_file "$WRAPPER_METADATA_FILE"
if [ -d "$WRAPPER_CLASSES_DIR" ]; then
    write_metadata_file "$WRAPPER_COMPILED_METADATA_FILE"
fi

if [ -z "$RUMBLE_JAR" ]; then
    echo "Building Rumble from source..." >&2
    (cd "$RUMBLE_DIR" && mvn -q -DskipTests clean compile assembly:single)
    RUMBLE_JAR=$(resolve_rumble_jar)
    CURRENT_BUILD_SIGNATURE=$(build_signature)
elif ! stamp_commit_matches_checkout; then
    echo "Adopting existing Rumble jar for commit $RUMBLE_COMMIT_SHORT..." >&2
fi

update_rumble_jar_link
write_metadata_file "$WRAPPER_METADATA_FILE"
if [ -d "$WRAPPER_CLASSES_DIR" ]; then
    write_metadata_file "$WRAPPER_COMPILED_METADATA_FILE"
fi
printf '%s' "$CURRENT_BUILD_SIGNATURE" >"$WRAPPER_BUILD_STAMP"

echo "Prepared Rumble $(extract_rumble_version_from_jar "$RUMBLE_JAR") at commit $RUMBLE_COMMIT_SHORT ($RUMBLE_CURRENT_REF)." >&2
