package org.jsoniq.lsp.wrapper.cli;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.jsoniq.lsp.wrapper.types.FunctionDefinition;
import org.rumbledb.context.ConstructorFunctionResolver;
import org.rumbledb.context.FunctionIdentifier;
import org.rumbledb.context.Name;

/** Exports built-in constructors separately from ordinary functions and imported schemas. */
public final class BuiltinConstructors implements CLICommand {
    public record Catalog(List<FunctionDefinition> jsoniq, List<FunctionDefinition> xquery) {}

    @Override
    public String flag() {
        return "--dump-builtin-constructors";
    }

    @Override
    public Catalog run() throws ReflectiveOperationException {
        Stream<String> itemTypeNames = new BuiltInTypes().listBuiltinTypes().stream()
                .filter(type -> type.name() != null && Name.XS_NS.equals(type.name().namespaceUri()))
                .map(type -> type.name().localName());
        // These list types have constructors, but are not named XDM item types.
        List<String> names = Stream.concat(itemTypeNames, Stream.of("IDREFS", "NMTOKENS", "ENTITIES"))
                .distinct()
                .sorted()
                .toList();
        return new Catalog(listConstructors(names, "jsoniq31"), listConstructors(names, "xquery31"));
    }

    private static List<FunctionDefinition> listConstructors(List<String> names, String language) {
        List<FunctionDefinition> result = new ArrayList<>();
        for (String localName : names) {
            addConstructor(result, new Name(Name.XS_NS, "xs", localName), language);
            if (language.startsWith("jsoniq")) {
                addConstructor(result, new Name(Name.JSONIQ_DEFAULT_FUNCTION_NS, null, localName), language);
            }
        }
        return List.copyOf(result);
    }

    private static void addConstructor(List<FunctionDefinition> result, Name name, String language) {
        FunctionIdentifier identifier = new FunctionIdentifier(name, 1);
        var constructor = ConstructorFunctionResolver.resolveBuiltIn(identifier, language);
        if (constructor != null) {
            // Preserve the callable name: JSONiq aliases resolve to an xs: target internally.
            result.add(new FunctionDefinition(
                    FunctionDefinition.Name.create(identifier),
                    FunctionDefinition.Signature.fromFunctionSignature(constructor.signature())));
        }
    }
}
