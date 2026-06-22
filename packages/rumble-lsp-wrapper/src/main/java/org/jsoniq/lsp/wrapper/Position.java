package org.jsoniq.lsp.wrapper;

import org.rumbledb.exceptions.SourcePosition;

public record Position(int line, int character) {

    /**
     * Creates a Position object from the given source position.
     * 
     * Note: in language server, the type Position.line uses uinteger type, and
     * starts from 0,
     * while in Rumble SourcePosition, the line number starts from 1, that's why
     * 1 is subtracted from the line number to make it uniform.
     * 
     * @param metadata the source position to create the position from
     * @return a Position object representing the position of the error in the
     *         source code
     */
    public static Position fromSourcePosition(SourcePosition metadata) {
        int line = Math.max(0, metadata.line() - 1);
        int column = Math.max(0, metadata.column());
        return new Position(line, column);
    }
}
