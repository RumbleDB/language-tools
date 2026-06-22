package org.jsoniq.lsp.wrapper;

public record Error(
        String code,
        String message) {
}