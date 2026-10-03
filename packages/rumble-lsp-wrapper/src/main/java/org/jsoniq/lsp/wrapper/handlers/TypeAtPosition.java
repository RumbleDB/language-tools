package org.jsoniq.lsp.wrapper.handlers;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Objects;

import org.jsoniq.lsp.wrapper.Position;
import org.jsoniq.lsp.wrapper.Range;
import org.jsoniq.lsp.wrapper.messages.Request;
import org.jsoniq.lsp.wrapper.messages.ResponseBody;
import org.jsoniq.lsp.wrapper.types.SequenceType;

import org.rumbledb.bindings.ExternalBindings;
import org.rumbledb.compiler.CompilationPipeline;
import org.rumbledb.config.CompilationConfiguration;
import org.rumbledb.config.RumbleConfiguration;
import org.rumbledb.exceptions.ExceptionMetadata;
import org.rumbledb.expressions.AbstractNodeVisitor;
import org.rumbledb.expressions.Expression;
import org.rumbledb.expressions.Node;
import org.rumbledb.expressions.control.TypeSwitchExpression;
import org.rumbledb.expressions.control.TypeswitchCase;
import org.rumbledb.expressions.flowr.CountClause;
import org.rumbledb.expressions.flowr.ForClause;
import org.rumbledb.expressions.flowr.GroupByClause;
import org.rumbledb.expressions.flowr.GroupByVariableDeclaration;
import org.rumbledb.expressions.flowr.LetClause;
import org.rumbledb.expressions.flowr.WindowClause;
import org.rumbledb.expressions.module.FunctionDeclaration;
import org.rumbledb.expressions.module.MainModule;
import org.rumbledb.expressions.module.VariableDeclaration;
import org.rumbledb.expressions.postfix.ObjectLookupExpression;
import org.rumbledb.expressions.primary.InlineFunctionExpression;
import org.rumbledb.expressions.scripting.control.TypeSwitchStatement;
import org.rumbledb.expressions.scripting.control.TypeSwitchStatementCase;
import org.rumbledb.expressions.scripting.declaration.VariableDeclStatement;
import org.rumbledb.expressions.update.CopyDeclaration;
import org.rumbledb.expressions.update.TransformExpression;

public final class TypeAtPosition implements RequestHandler {
    public static final String REQUEST_TYPE = "type-at-position";
    public static final Result EMPTY_RESULT = new Result(null, null);

    public record Result(SequenceType sequenceType, Range range) implements ResponseBody {}

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
        URI documentUri = URI.create(Objects.requireNonNull(request.documentUri(), "documentUri is required."));
        if (request.body() == null || request.body().isEmpty() || request.position() == null) {
            return EMPTY_RESULT;
        }

        String query = new String(Base64.getDecoder().decode(request.body()), StandardCharsets.UTF_8);
        return findType(query, documentUri, request.position());
    }

    @Override
    public Result createEmptyResponse() {
        return EMPTY_RESULT;
    }

    public Result findType(String query, URI documentUri, Position position) {
        Objects.requireNonNull(documentUri, "documentUri is required.");
        if (query == null || query.isEmpty() || position == null) {
            return EMPTY_RESULT;
        }

        try {
            MainModule module = CompilationPipeline.compileMainModule(
                    query, documentUri, new CompilationConfiguration(this.configuration), ExternalBindings.empty());
            List<Candidate> candidates = new TypeAtPositionVisitor().visit(module, new ArrayList<>());
            Candidate candidate = selectCandidate(candidates, position);
            if (candidate == null || candidate.sequenceType() == null) {
                return EMPTY_RESULT;
            }
            return new Result(SequenceType.fromSequenceType(candidate.sequenceType()), candidate.resultRange());
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
                                expression.getStaticSequenceType()));
            }
            return visitDescendants(node, candidates);
        }

        @Override
        public List<Candidate> visitObjectLookupExpression(
                ObjectLookupExpression expression, List<Candidate> candidates) {
            Expression key = expression.getLookupExpression();
            if (key != null) {
                addCandidate(
                        candidates,
                        Candidate.create(
                                CandidateKind.EXPLICIT,
                                key.getMetadata(),
                                expression.getMetadata(),
                                expression.getStaticSequenceType()));
            }
            return defaultAction(expression, candidates);
        }

        @Override
        public List<Candidate> visitVariableDeclaration(VariableDeclaration declaration, List<Candidate> candidates) {
            addBindingCandidate(candidates, declaration.getVariableMetadata(), declaration.getSequenceType());
            return defaultAction(declaration, candidates);
        }

        @Override
        public List<Candidate> visitForClause(ForClause clause, List<Candidate> candidates) {
            addBindingCandidate(candidates, clause.getVariableMetadata(), clause.getVariableSequenceType());
            addBindingCandidate(
                    candidates, clause.getPositionalVariableMetadata(), clause.getPositionalVariableSequenceType());
            return defaultAction(clause, candidates);
        }

        @Override
        public List<Candidate> visitLetClause(LetClause clause, List<Candidate> candidates) {
            addBindingCandidate(candidates, clause.getVariableMetadata(), clause.getVariableSequenceType());
            return defaultAction(clause, candidates);
        }

        @Override
        public List<Candidate> visitGroupByClause(GroupByClause clause, List<Candidate> candidates) {
            for (GroupByVariableDeclaration variable : clause.getGroupVariables()) {
                addBindingCandidate(candidates, variable.getVariableMetadata(), variable.getVariableSequenceType());
            }
            return defaultAction(clause, candidates);
        }

        @Override
        public List<Candidate> visitCountClause(CountClause clause, List<Candidate> candidates) {
            addBindingCandidate(candidates, clause.getVariableMetadata(), clause.getVariableSequenceType());
            return defaultAction(clause, candidates);
        }

        @Override
        public List<Candidate> visitWindowClause(WindowClause clause, List<Candidate> candidates) {
            addBindingCandidate(
                    candidates, clause.getVariableMetadata(clause.getWindowVariable()), clause.getSequenceType());
            addWindowConditionCandidates(candidates, clause, clause.getStartCondition());
            if (clause.getEndCondition() != null) {
                addWindowConditionCandidates(candidates, clause, clause.getEndCondition());
            }
            return defaultAction(clause, candidates);
        }

        private static void addWindowConditionCandidates(
                List<Candidate> candidates, WindowClause clause, WindowClause.WindowCondition condition) {
            for (var name : condition.variables().names()) {
                addBindingCandidate(
                        candidates, clause.getVariableMetadata(name), clause.getConditionVariableSequenceType(name));
            }
        }

        @Override
        public List<Candidate> visitInlineFunctionExpr(InlineFunctionExpression function, List<Candidate> candidates) {
            for (var parameter : function.getParams().entrySet()) {
                addBindingCandidate(
                        candidates, function.getParameterMetadata().get(parameter.getKey()), parameter.getValue());
            }
            return defaultAction(function, candidates);
        }

        @Override
        public List<Candidate> visitTypeSwitchExpression(TypeSwitchExpression expression, List<Candidate> candidates) {
            for (TypeswitchCase variable : expression.getCases()) {
                addBindingCandidate(candidates, variable.getVariableMetadata(), variable.getVariableSequenceType());
            }
            TypeswitchCase variable = expression.getDefaultCase();
            addBindingCandidate(candidates, variable.getVariableMetadata(), variable.getVariableSequenceType());
            return defaultAction(expression, candidates);
        }

        @Override
        public List<Candidate> visitTypeSwitchStatement(TypeSwitchStatement statement, List<Candidate> candidates) {
            for (TypeSwitchStatementCase variable : statement.getCases()) {
                addBindingCandidate(candidates, variable.getVariableMetadata(), variable.getVariableSequenceType());
            }
            TypeSwitchStatementCase variable = statement.getDefaultCase();
            addBindingCandidate(candidates, variable.getVariableMetadata(), variable.getVariableSequenceType());
            return defaultAction(statement, candidates);
        }

        @Override
        public List<Candidate> visitTransformExpression(TransformExpression expression, List<Candidate> candidates) {
            for (CopyDeclaration variable : expression.getCopyDeclarations()) {
                addBindingCandidate(candidates, variable.getVariableMetadata(), variable.getSourceSequenceType());
            }
            return defaultAction(expression, candidates);
        }

        @Override
        public List<Candidate> visitVariableDeclStatement(VariableDeclStatement statement, List<Candidate> candidates) {
            addBindingCandidate(candidates, statement.getVariableMetadata(), statement.getStaticSequenceType());
            return defaultAction(statement, candidates);
        }

        private static void addBindingCandidate(
                List<Candidate> candidates, ExceptionMetadata metadata, org.rumbledb.types.SequenceType sequenceType) {
            addCandidate(candidates, Candidate.create(CandidateKind.EXPLICIT, metadata, metadata, sequenceType));
        }

        @Override
        public List<Candidate> visitFunctionDeclaration(FunctionDeclaration declaration, List<Candidate> candidates) {
            if (declaration.getExpression() instanceof InlineFunctionExpression function) {
                addCandidate(
                        candidates,
                        Candidate.create(
                                CandidateKind.EXPLICIT,
                                declaration.getNameMetadata(),
                                declaration.getNameMetadata(),
                                function.getReturnType()));
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
