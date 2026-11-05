package org.jsoniq.lsp.wrapper.handlers;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import org.jsoniq.lsp.wrapper.Position;
import org.jsoniq.lsp.wrapper.Range;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;
import org.jsoniq.lsp.wrapper.types.ResolvedQName;
import org.jsoniq.lsp.wrapper.types.SequenceType;

import org.rumbledb.compiler.TolerantCompiler;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.expressions.Expression;
import org.rumbledb.expressions.Node;
import org.rumbledb.expressions.flowr.SimpleMapExpression;
import org.rumbledb.expressions.module.Module;
import org.rumbledb.expressions.postfix.FilterExpression;
import org.rumbledb.expressions.postfix.ObjectLookupExpression;
import org.rumbledb.expressions.xml.SlashExpr;
import org.rumbledb.expressions.xml.axis.ForwardAxis;
import org.rumbledb.expressions.xml.axis.ForwardStepExpr;
import org.rumbledb.expressions.xml.node_test.AnyKindTest;
import org.rumbledb.types.ItemType;
import org.rumbledb.xml.schema.SchemaContentModel;

/**
 * Tells what the lookup or path step being written at a position applies to, so that editors can suggest its fields or
 * step names. This is the left side of the innermost object lookup, path step, predicate or simple map around the
 * position, whether or not the right side has been written yet.
 */
public final class FocusAtPosition implements RequestHandler {
    public static final String REQUEST_TYPE = "focus-at-position";
    public static final Result EMPTY_RESULT = new Result(null, null);

    /**
     * pathSteps lists the child and attribute steps that the schema declares for the items, or null when they are not
     * schema-typed. It may omit names that a wildcard allows.
     */
    public record Result(SequenceType sequenceType, List<PathStep> pathSteps) implements ResponseBody {}

    /**
     * A child or attribute name, whether it is an attribute, and the type of the nodes that a step with that name
     * selects from one item, or null when the schema does not determine it.
     */
    public record PathStep(ResolvedQName name, boolean attribute, SequenceType sequenceType) {}

    /** The expression whose items are the focus, and whether the focus also has the descendants of each item. */
    private record Focus(Expression items, boolean throughDescendants) {}

    private final RumbleConfiguration configuration = RumbleConfiguration.defaultConfiguration();

    @Override
    public String getRequestType() {
        return REQUEST_TYPE;
    }

    @Override
    public Result handle(Request request) {
        URI documentUri = URI.create(Objects.requireNonNull(request.documentUri(), "documentUri is required."));
        if (request.body() == null || request.body().isEmpty() || request.position() == null) {
            return EMPTY_RESULT;
        }

        String query = new String(Base64.getDecoder().decode(request.body()), StandardCharsets.UTF_8);
        return findFocus(query, documentUri, request.position());
    }

    @Override
    public Result createEmptyResponse() {
        return EMPTY_RESULT;
    }

    public Result findFocus(String query, URI documentUri, Position position) {
        try {
            // Even for a valid query: after RumbleDB's optimizations, $a in $a.b only has the fields that are looked
            // up.
            Module module = TolerantCompiler.compile(query, documentUri, this.configuration);
            Focus focus = innermostFocus(module, position);
            if (focus == null) {
                return EMPTY_RESULT;
            }
            org.rumbledb.types.SequenceType type = focus.items().getStaticSequenceType();
            if (type == null || TolerantCompiler.isUnknown(type)) {
                return EMPTY_RESULT;
            }
            return new Result(
                    SequenceType.fromSequenceType(type),
                    pathSteps(module, type.getItemType(), focus.throughDescendants()));
        } catch (Throwable throwable) {
            return EMPTY_RESULT;
        }
    }

    private static Focus innermostFocus(Node node, Position position) {
        for (Node child : node.getChildren()) {
            Focus focus = child == null ? null : innermostFocus(child, position);
            if (focus != null) {
                return focus;
            }
        }
        Focus focus = focusOf(node);
        return focus != null && isAfterItems(node, focus.items(), position) ? focus : null;
    }

    /** Whether the position is in the node, after the expression that gives the items. */
    private static boolean isAfterItems(Node node, Expression items, Position position) {
        if (TolerantCompiler.isSynthetic(node.getMetadata()) || TolerantCompiler.isSynthetic(items.getMetadata())) {
            return false;
        }
        return Range.fromExceptionMetadata(items.getMetadata()).end().compareTo(position) <= 0
                && position.compareTo(
                                Range.fromExceptionMetadata(node.getMetadata()).end())
                        <= 0;
    }

    /** The focus that the node gives its right side, or null when it gives none. */
    private static Focus focusOf(Node node) {
        if (node instanceof ObjectLookupExpression lookup) {
            return new Focus(lookup.getMainExpression(), false);
        }
        if (node instanceof FilterExpression filter) {
            return new Focus(filter.getMainExpression(), false);
        }
        if (node instanceof SimpleMapExpression map) {
            return new Focus((Expression) map.getChildren().get(0), false);
        }
        if (node instanceof SlashExpr slash) {
            // E//S abbreviates E/descendant-or-self::node()/S, so S applies to the descendants of E, and the step that
            // E// ends with is not itself being written.
            if (isDescendantOrSelfNode(slash)) {
                return null;
            }
            return slash.getLeftExpression() instanceof SlashExpr left && isDescendantOrSelfNode(left)
                    ? new Focus(left.getLeftExpression(), true)
                    : new Focus(slash.getLeftExpression(), false);
        }
        return null;
    }

    private static boolean isDescendantOrSelfNode(SlashExpr slash) {
        return slash.getRightExpression() instanceof ForwardStepExpr step
                && step.getForwardAxis().equals(ForwardAxis.DESCENDANT_OR_SELF)
                && step.getNodeTest() instanceof AnyKindTest;
    }

    /** The steps that the schema declares for items of the type, or null when they are not schema-typed. */
    private static List<PathStep> pathSteps(Module module, ItemType itemType, boolean throughDescendants) {
        // Only load the schema catalog for schema-typed nodes.
        if (!SchemaContentModel.isSchemaTyped(itemType)) {
            return null;
        }
        SchemaContentModel contentModel = module.getStaticContext()
                .getInScopeSchemaTypes()
                .getXmlSchemaCatalog()
                .getContentModel();
        // Steps select from each item, or for E//S from each node of the union of the items and their descendants.
        Optional<org.rumbledb.types.SequenceType> stepParents = throughDescendants
                ? contentModel.getDescendantOrSelfType(itemType)
                : Optional.of(new org.rumbledb.types.SequenceType(itemType));
        Optional<List<PathStep>> children = axisSteps(contentModel, itemType, stepParents, false, throughDescendants);
        Optional<List<PathStep>> attributes = axisSteps(contentModel, itemType, stepParents, true, throughDescendants);
        if (children.isEmpty() && attributes.isEmpty()) {
            return null;
        }
        List<PathStep> steps = new ArrayList<>(children.orElse(List.of()));
        steps.addAll(attributes.orElse(List.of()));
        return steps;
    }

    /** The steps on one axis, or nothing when the schema does not determine them. */
    private static Optional<List<PathStep>> axisSteps(
            SchemaContentModel contentModel,
            ItemType itemType,
            Optional<org.rumbledb.types.SequenceType> stepParents,
            boolean attributeAxis,
            boolean throughDescendants) {
        return contentModel
                .getStepNames(itemType, attributeAxis, throughDescendants)
                .map(names -> names.stream()
                        .map(name -> new PathStep(
                                ResolvedQName.fromName(name),
                                attributeAxis,
                                stepParents
                                        .flatMap(parents -> contentModel
                                                .getStepType(parents.getItemType(), attributeAxis, name)
                                                .map(type -> type.repeated(parents.getCardinality())))
                                        .map(SequenceType::fromSequenceType)
                                        .orElse(null)))
                        .toList());
    }
}
