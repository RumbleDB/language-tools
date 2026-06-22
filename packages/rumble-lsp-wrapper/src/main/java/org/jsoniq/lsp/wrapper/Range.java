package org.jsoniq.lsp.wrapper;

public record Range(
        Position start,
        Position end) {

    public static Range fromExceptionMetadata(org.rumbledb.exceptions.ExceptionMetadata metadata) {
        Position start = Position.fromSourcePosition(metadata.getStart());
        Position end = Position.fromSourcePosition(metadata.getEnd());
        return new Range(start, end);
    }
}
