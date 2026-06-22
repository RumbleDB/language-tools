package org.jsoniq.lsp.wrapper.cli;

public interface CLICommand {
    String flag();

    Object run() throws Exception;
}