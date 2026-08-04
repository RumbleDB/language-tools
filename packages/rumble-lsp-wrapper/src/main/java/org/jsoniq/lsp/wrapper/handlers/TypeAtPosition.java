package org.jsoniq.lsp.wrapper.handlers;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

import org.jsoniq.lsp.wrapper.Position;
import org.jsoniq.lsp.wrapper.Range;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;
import org.jsoniq.lsp.wrapper.types.SequenceType;
import org.rumbledb.bindings.ExternalBindings;
import org.rumbledb.compiler.VisitorHelpers;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.expressions.AbstractNodeVisitor;
import org.rumbledb.expressions.Expression;
import org.rumbledb.expressions.Node;
import org.rumbledb.expressions.module.FunctionDeclaration;
import org.rumbledb.expressions.module.MainModule;
import org.rumbledb.expressions.module.VariableDeclaration;
import org.rumbledb.expressions.postfix.ObjectLookupExpression;
import org.rumbledb.expressions.primary.InlineFunctionExpression;

public final class TypeAtPosition implements RequestHandler {
    public static final String REQUEST_TYPE = "type-at-position";
    public static final Result EMPTY_RESULT = new Result(null, null);

    public record Result(
            SequenceType sequenceType,
            Range range) implements ResponseBody {
    }

    private final RumbleConfiguration configuration;

    public TypeAtPosition() {
        this.configuration = RumbleConfiguration.defaultConfiguration();
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
                    ? VisitorHelpers.parseMainModuleFromQuery(query, this.configuration, ExternalBindings.empty())
                    : VisitorHelpers.parseMainModule(query, documentUri, this.configuration, ExternalBindings.empty());
            List<Candidate> candidates = new TypeAtPositionVisitor().visit(module, new ArrayList<>());
            Candidate candidate = selectCandidate(candidates, position);
            if (candidate == null || candidate.sequenceType() == null) {
                return EMPTY_RESULT;
            }
            return new Result(
                    SequenceType.fromSequenceType(candidate.sequenceType()),
                    candidate.resultRange());
        } catch (Throwable throwable) {
            return EMPTY_RESULT;
        }
    }

    private enum CandidateKind {
        EXPLICIT,
        EXPRESSION
    }

    private record Candidate(
            CandidateKind kind,
            Range activationRange,
            Range resultRange,
            org.rumbledb.types.SequenceType sequenceType) {

        private static Candidate create(
                CandidateKind kind,
                ExceptionMetadata activationMetadata,
                ExceptionMetadata resultMetadata,
                org.rumbledb.types.SequenceType sequenceType) {
            if (activationMetadata == null || resultMetadata == null || sequenceType == null) {
                return null;
            }
            return new Candidate(
                    kind,
                    Range.fromExceptionMetadata(activationMetadata),
                    Range.fromExceptionMetadata(resultMetadata),
                    sequenceType);
        }

        private boolean contains(Position position) {
            return this.activationRange.start().compareTo(position) <= 0
                    && position.compareTo(this.activationRange.end()) <= 0;
        }

        private static Candidate preferSmallest(Candidate current, Candidate candidate) {
            if (current == null) {
                return candidate;
            }

            int startComparison = candidate.activationRange.start().compareTo(current.activationRange.start());
            int endComparison = candidate.activationRange.end().compareTo(current.activationRange.end());
            if (startComparison > 0 || (startComparison == 0 && endComparison < 0)) {
                return candidate;
            }
            return current;
        }

        private static Candidate preferWidest(Candidate current, Candidate candidate) {
            if (current == null) {
                return candidate;
            }
            return candidate.activationRange.start().compareTo(current.activationRange.start()) < 0
                    ? candidate
                    : current;
        }
    }

    private static Candidate selectCandidate(List<Candidate> candidates, Position position) {
        Candidate explicit = candidates.stream()
                .filter(candidate -> candidate.kind() == CandidateKind.EXPLICIT)
                .filter(candidate -> candidate.contains(position))
                .reduce(Candidate::preferSmallest)
                .orElse(null);
        if (explicit != null) {
            return explicit;
        }

        Candidate endingExpression = candidates.stream()
                .filter(candidate -> candidate.kind() == CandidateKind.EXPRESSION)
                .filter(candidate -> candidate.activationRange().end().compareTo(position) == 0)
                .reduce(Candidate::preferWidest)
                .orElse(null);
        if (endingExpression != null) {
            return endingExpression;
        }

        return candidates.stream()
                .filter(candidate -> candidate.kind() == CandidateKind.EXPRESSION)
                .filter(candidate -> candidate.contains(position))
                .reduce(Candidate::preferSmallest)
                .orElse(null);
    }

    private static final class TypeAtPositionVisitor extends AbstractNodeVisitor<List<Candidate>> {
        @Override
        protected List<Candidate> defaultAction(Node node, List<Candidate> candidates) {
            if (node instanceof Expression expression) {
                addCandidate(
                    candidates,
                    Candidate.create(
                        CandidateKind.EXPRESSION,
                        expression.getMetadata(),
                        expression.getMetadata(),
                        expression.getStaticSequenceType()
                    )
                );
            }
            return visitDescendants(node, candidates);
        }

        @Override
        public List<Candidate> visitObjectLookupExpression(
                ObjectLookupExpression expression,
                List<Candidate> candidates) {
            Expression key = expression.getLookupExpression();
            if (key != null) {
                addCandidate(
                    candidates,
                    Candidate.create(
                        CandidateKind.EXPLICIT,
                        key.getMetadata(),
                        expression.getMetadata(),
                        expression.getStaticSequenceType()
                    )
                );
            }
            return defaultAction(expression, candidates);
        }

        @Override
        public List<Candidate> visitVariableDeclaration(
                VariableDeclaration declaration,
                List<Candidate> candidates) {
            addCandidate(
                candidates,
                Candidate.create(
                    CandidateKind.EXPLICIT,
                    declaration.getVariableMetadata(),
                    declaration.getVariableMetadata(),
                    declaration.getSequenceType()
                )
            );
            return defaultAction(declaration, candidates);
        }

        @Override
        public List<Candidate> visitFunctionDeclaration(
                FunctionDeclaration declaration,
                List<Candidate> candidates) {
            if (declaration.getExpression() instanceof InlineFunctionExpression function) {
                addCandidate(
                    candidates,
                    Candidate.create(
                        CandidateKind.EXPLICIT,
                        declaration.getNameMetadata(),
                        declaration.getNameMetadata(),
                        function.getReturnType()
                    )
                );
            }
            return defaultAction(declaration, candidates);
        }

        private static void addCandidate(List<Candidate> candidates, Candidate candidate) {
            if (candidate != null) {
                candidates.add(candidate);
            }
        }
    }
}
