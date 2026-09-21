import type {
  CaseResult,
  TurnResult,
} from "../../../packages/core/src/studio.js";

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function userMessage(turn: TurnResult) {
  const messages = object(turn.input).conversation;
  if (!Array.isArray(messages))
    return "Message unavailable in this older trace.";
  const latest = messages.at(-1);
  return typeof object(latest).content === "string"
    ? String(object(latest).content)
    : "Message unavailable.";
}

export function DecisionTrace({ result }: { result: CaseResult }) {
  return (
    <div className="p-decision-trace">
      {!!result.failureReasons?.length && (
        <div className="p-failure-summary" role="note">
          <strong>What failed</strong>
          <ul>
            {result.failureReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {result.turns.map((turn, index) => {
        const expected =
          result.expectedPath?.[index] ??
          (index === result.turns.length - 1 ? result.expected : null);
        const question = object(object(turn.questions).next_state);
        const criteria = object(question.criteria);
        const mismatch = expected !== null && expected !== turn.to;
        return (
          <article
            className={`p-decision-step ${mismatch ? "mismatch" : ""}`}
            key={turn.id}
            aria-label={`Decision at turn ${index + 1}`}
          >
            <header>
              <strong>
                Turn {index + 1} · {turn.from} → {turn.to}
              </strong>
              <span className="p-badge">
                {turn.mode === "mock" ? "Simulation" : turn.model}
              </span>
            </header>
            <div className="p-trace-message">
              <span>USER</span>
              <p>{userMessage(turn)}</p>
            </div>
            {expected && (
              <p className="p-path-expectation">
                Expected <strong>{expected}</strong> · reached{" "}
                <strong>{turn.to}</strong>
                {mismatch ? " · Path mismatch" : " · Matches"}
              </p>
            )}
            <p className="p-trace-rule">{turn.reason}</p>
            <div className="p-trace-message">
              <span>ASSISTANT</span>
              <p>{turn.reply}</p>
            </div>
            <details>
              <summary>
                Decision criteria and probabilities ·{" "}
                {Math.round(turn.confidence * 100)}% confidence
              </summary>
              <p className="p-field-hint">
                These are the criteria recorded for this turn. Confidence
                describes how concentrated the Choice distribution is.
              </p>
              <dl>
                {Object.entries(criteria).map(([state, criterion]) => (
                  <div key={state}>
                    <dt>
                      {state}{" "}
                      <span>
                        {Math.round((turn.probabilities[state] ?? 0) * 100)}%
                      </span>
                    </dt>
                    <dd>
                      {typeof criterion === "string"
                        ? criterion
                        : JSON.stringify(criterion)}
                    </dd>
                  </div>
                ))}
              </dl>
              <small>
                {turn.inputTokens + turn.outputTokens} tokens · {turn.elapsedMs}{" "}
                ms
              </small>
            </details>
          </article>
        );
      })}
    </div>
  );
}
