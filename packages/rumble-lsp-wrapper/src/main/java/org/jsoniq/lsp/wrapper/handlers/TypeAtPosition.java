package org.jsoniq.lsp.wrapper.handlers;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

import org.jsoniq.lsp.wrapper.Position;
import org.jsoniq.lsp.wrapper.Range;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;
import org.jsoniq.lsp.wrapper.types.SequenceType;
import org.rumbledb.compiler.VisitorHelpers;
import org.rumbledb.config.RumbleRuntimeConfiguration;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.expressions.Expression;
import org.rumbledb.expressions.Node;
import org.rumbledb.expressions.module.MainModule;
import org.rumbledb.expressions.postfix.ObjectLookupExpression;

public final class TypeAtPosition implements RequestHandler {
    public static final String REQUEST_TYPE = "type-at-position";
    public static final Result EMPTY_RESULT = new Result(null, null);

    public record Result(
            SequenceType sequenceType,
            Range range) implements ResponseBody {
    }

    private final RumbleRuntimeConfiguration configuration;

    public TypeAtPosition() {
        this.configuration = new RumbleRuntimeConfiguration();
    }

    @Override
    public String getRequestType() {
        return REQUEST_TYPE;
    }

    @Override
    public Result handle(Request request) {
        if (request.body() == null || request.body().isEmpty() || request.position() == null) {
            return EMPTY_RESULT;
        }

        String query = new String(Base64.getDecoder().decode(request.body()), StandardCharsets.UTF_8);
        URI documentUri = request.documentUri() == null ? null : URI.create(request.documentUri());
        return findType(query, documentUri, request.position());
    }

    @Override
    public Result createEmptyResponse() {
        return EMPTY_RESULT;
    }

    public Result findType(String query, Position position) {
        return findType(query, null, position);
    }

    public Result findType(String query, URI documentUri, Position position) {
        if (query == null || query.isEmpty() || position == null) {
            return EMPTY_RESULT;
        }

        try {
            MainModule module = documentUri == null
                    ? VisitorHelpers.parseMainModuleFromQuery(query, this.configuration)
                    : VisitorHelpers.parseMainModule(query, documentUri, this.configuration);
            Expression expression = findExpression(module, position);
            if (expression == null || expression.getStaticSequenceType() == null) {
                return EMPTY_RESULT;
            }
            return new Result(
                    SequenceType.fromSequenceType(expression.getStaticSequenceType()),
                    Range.fromExceptionMetadata(expression.getMetadata()));
        } catch (Throwable throwable) {
            return EMPTY_RESULT;
        }
    }

    private static Expression findExpression(Node root, Position position) {
        Candidate objectLookupKeyCandidate = findBestObjectLookupKeyCandidate(root, position, null);
        if (objectLookupKeyCandidate != null) {
            return objectLookupKeyCandidate.expression();
        }

        Candidate bestEnding = findBestCandidate(root, position, true, null);
        if (bestEnding != null) {
            return bestEnding.expression();
        }

        Candidate bestContaining = findBestCandidate(root, position, false, null);
        return bestContaining == null ? null : bestContaining.expression();
    }

    private static Candidate findBestObjectLookupKeyCandidate(Node node, Position position, Candidate best) {
        if (node == null) {
            return best;
        }

        if (node instanceof ObjectLookupExpression objectLookupExpression) {
            Expression lookupExpression = objectLookupExpression.getLookupExpression();
            Candidate lookupCandidate = lookupExpression == null ? null : Candidate.create(lookupExpression);
            Candidate objectLookupCandidate = Candidate.create(objectLookupExpression);
            boolean positionIsInsideLookupKey = lookupCandidate != null
                    && objectLookupCandidate != null
                    && lookupCandidate.matches(position, false);

            if (positionIsInsideLookupKey) {
                best = Candidate.prefer(best, objectLookupCandidate, false);
            }
        }

        for (Node child : node.getChildren()) {
            best = findBestObjectLookupKeyCandidate(child, position, best);
        }
        return best;
    }

    private static Candidate findBestCandidate(
            Node node,
            Position position,
            boolean endingOnly,
            Candidate best) {
        if (node == null) {
            return best;
        }

        if (node instanceof Expression expression && expression.getMetadata() != null) {
            /// We only consider expressions as candidates for now
            Candidate candidate = Candidate.create(expression);
            if (candidate != null && candidate.matches(position, endingOnly)) {
                best = Candidate.prefer(best, candidate, endingOnly);
            }
        }

        for (Node child : node.getChildren()) {
            best = findBestCandidate(child, position, endingOnly, best);
        }
        return best;
    }

    private record Candidate(
            Expression expression,
            Position start,
            Position end) {

        private static Candidate create(Expression expression) {
            ExceptionMetadata metadata = expression.getMetadata();
            if (metadata == null) {
                return null;
            }
            return new Candidate(
                    expression,
                    Position.fromSourcePosition(metadata.getStart()),
                    Position.fromSourcePosition(metadata.getEnd()));
        }

        private boolean matches(Position position, boolean endingOnly) {
            if (endingOnly) {
                return this.end.compareTo(position) == 0;
            }
            return this.start.compareTo(position) <= 0 && position.compareTo(this.end) <= 0;
        }

        private static Candidate prefer(Candidate current, Candidate candidate, boolean endingOnly) {
            if (current == null) {
                return candidate;
            }

            int startComparison = candidate.start.compareTo(current.start);
            int endComparison = candidate.end.compareTo(current.end);
            if (endingOnly) {
                return startComparison < 0 ? candidate : current;
            }
            if (startComparison > 0 || (startComparison == 0 && endComparison < 0)) {
                return candidate;
            }
            return current;
        }
    }
}
