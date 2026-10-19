package org.jsoniq.lsp.wrapper.cli;

import java.util.Comparator;
import java.util.List;

import org.jsoniq.lsp.wrapper.types.TypeDefinition;

import org.rumbledb.types.BuiltinTypesCatalogue;

public class BuiltInTypes implements CLICommand {
    @Override
    public String flag() {
        return "--dump-builtin-types";
    }

    @Override
    public Object run() throws Exception {
        return listBuiltinTypes();
    }

    public List<TypeDefinition> listBuiltinTypes() {
        return BuiltinTypesCatalogue.getBuiltinItemTypes().stream()
                .map(TypeDefinition::fromItemType)
                .sorted(Comparator.comparing(definition ->
                        definition.name() == null ? "" : definition.name().localName()))
                .toList();
    }
}
