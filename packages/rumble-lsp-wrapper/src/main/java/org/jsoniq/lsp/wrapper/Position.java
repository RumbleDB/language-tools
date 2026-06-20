package org.jsoniq.lsp.wrapper;

import org.rumbledb.exceptions.ExceptionMetadata;

public record Position(int line, int character) {

    /**
     * Creates a Position object from the given exception metadata.
     * 
     * Note: in language server, the type Position.line uses uinteger type, and
     * starts from 0,
     * while in Rumble ExceptionMetadata, the line number starts from 1, that's why
     * 1 is subtracted from the line number to make it uniform.
     * 
     * @param metadata the exception metadata to create the position from
     * @return a Position object representing the position of the error in the
     *         source code
     */
    public static Position fromExceptionMetadata(ExceptionMetadata metadata) {
        int line = Math.max(0, metadata.getStart().line() - 1);
        int column = Math.max(0, metadata.getStart().column());
        return new Position(line, column);
    }
}
