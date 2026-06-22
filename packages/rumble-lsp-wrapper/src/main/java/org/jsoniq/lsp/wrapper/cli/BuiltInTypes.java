package org.jsoniq.lsp.wrapper.cli;

import org.jsoniq.lsp.wrapper.types.TypeDefinition;
import org.rumbledb.types.BuiltinTypesCatalogue;
import org.rumbledb.types.ItemType;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Comparator;

public class BuiltInTypes implements CLICommand {
    @Override
    public String flag() {
        return "--dump-builtin-types";
    }

    @Override
    public Object run() throws Exception {
        return listBuiltinTypes();
    }

    public List<TypeDefinition> listBuiltinTypes() throws ReflectiveOperationException {
        /// TODO: add a method to BuiltinTypesCatalogue to get the built-in types
        /// instead of using reflection
        Field builtInItemTypesField = BuiltinTypesCatalogue.class.getDeclaredField("builtInItemTypes");
        builtInItemTypesField.setAccessible(true);

        @SuppressWarnings("unchecked")
        List<ItemType> builtInItemTypes = (List<ItemType>) builtInItemTypesField.get(null);

        return builtInItemTypes.stream()
                .map(TypeDefinition::fromItemType)
                .sorted(Comparator.comparing(definition -> definition.name() == null
                        ? ""
                        : definition.name().localName()))
                .toList();
    }
}
