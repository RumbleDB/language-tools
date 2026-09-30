package org.jsoniq.lsp.wrapper.handlers;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;

public class Handshake implements RequestHandler {
    private static final String BUILD_METADATA_RESOURCE = "rumble-build.properties";
    private static final String UNKNOWN_VALUE = "unknown";
    private static final Metadata METADATA = loadMetadata();

    private record Metadata(String rumbleVersion, String rumbleCommit, String rumbleCommitShort, String rumbleRef) {}

    private record Response(String rumbleVersion, String rumbleCommit, String rumbleCommitShort, String rumbleRef)
            implements ResponseBody {}

    static String getRumbleVersion() {
        return METADATA.rumbleVersion();
    }

    static String getRumbleCommit() {
        return METADATA.rumbleCommit();
    }

    static String getRumbleCommitShort() {
        return METADATA.rumbleCommitShort();
    }

    static String getRumbleRef() {
        return METADATA.rumbleRef();
    }

    private static Metadata loadMetadata() {
        Properties properties = new Properties();
        try (InputStream inputStream = Handshake.class.getClassLoader().getResourceAsStream(BUILD_METADATA_RESOURCE)) {
            if (inputStream == null) {
                return new Metadata(UNKNOWN_VALUE, UNKNOWN_VALUE, UNKNOWN_VALUE, UNKNOWN_VALUE);
            }

            properties.load(inputStream);
            return new Metadata(
                    properties.getProperty("rumble.version", UNKNOWN_VALUE),
                    properties.getProperty("rumble.commit", UNKNOWN_VALUE),
                    properties.getProperty("rumble.commitShort", UNKNOWN_VALUE),
                    properties.getProperty("rumble.currentRef", UNKNOWN_VALUE));
        } catch (IOException ignored) {
            return new Metadata(UNKNOWN_VALUE, UNKNOWN_VALUE, UNKNOWN_VALUE, UNKNOWN_VALUE);
        }
    }

    @Override
    public String getRequestType() {
        return "handshake";
    }

    @Override
    public ResponseBody handle(Request request) {
        return new Response(getRumbleVersion(), getRumbleCommit(), getRumbleCommitShort(), getRumbleRef());
    }

    @Override
    public ResponseBody createEmptyResponse() {
        return new Response(getRumbleVersion(), getRumbleCommit(), getRumbleCommitShort(), getRumbleRef());
    }
}
