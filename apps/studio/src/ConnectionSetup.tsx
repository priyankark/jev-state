import { useState } from "react";
import { ArrowUpRight, Loader2, ShieldCheck, X } from "lucide-react";

export function ConnectionSetup({
  provider,
  byok,
  onClose,
  onConnected,
  request,
  onBusy,
}: {
  provider: string;
  byok: boolean;
  onClose: () => void;
  onConnected: (key: string) => Promise<void>;
  request: <T>(path: string, body?: unknown) => Promise<T>;
  onBusy: (busy: boolean) => void;
}) {
  const [key, setKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = provider === "jev" ? "Jev" : "OpenAI";
  return (
    <div
      className="p-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Connection setup"
    >
      <div className="p-modal">
        <button
          className="p-modal-close"
          aria-label="Close connection setup"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <span className="p-kicker">CONNECT {name.toUpperCase()}</span>
        <h2>
          {byok ? `Bring your ${name} key.` : "One key. Kept server-side."}
        </h2>
        {byok ? (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!key.trim() || !consent || busy) return;
              setBusy(true);
              onBusy(true);
              setError("");
              let submittedKey = key.trim();
              const pending = request("/connections/key", {
                provider,
                key: submittedKey,
                consent,
              });
              setKey("");
              try {
                await pending;
                await onConnected(submittedKey);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Connection failed. Try again.",
                );
              } finally {
                submittedKey = "";
                setBusy(false);
                onBusy(false);
              }
            }}
          >
            <p>
              {provider === "jev"
                ? "Use live decisions and evaluations with your TypeSafe account."
                : "Generate replies with your OpenAI API account. Jev still chooses the state."}{" "}
              No Jev State account or subscription needed.
            </p>
            <label>
              API key
              <input
                type="password"
                name="provider-key"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                maxLength={1024}
                required
                disabled={busy}
                placeholder={`Paste your ${name} API key`}
              />
            </label>
            <div className="p-key-notice">
              <ShieldCheck size={18} />
              <p>
                Your key stays in this tab’s memory and is sent to our server
                only for provider requests. It is not saved in cookies, browser
                storage, exports, or a server database. Reload or Disconnect to
                clear it.
              </p>
            </div>
            <label className="p-key-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                required
                disabled={busy}
              />
              <span>
                I understand that requests pass through this server and live
                usage is charged to my provider account.
              </span>
            </label>
            {error && (
              <p role="alert" className="p-inline-error">
                {error}
              </p>
            )}
            <button
              className="p-button p-primary p-full"
              disabled={busy || !key.trim() || !consent}
              type="submit"
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="spin" /> Verifying connection…
                </>
              ) : (
                `Connect ${name}`
              )}
            </button>
            <p className="p-field-hint">
              Connecting checks account access without generating a reply.
              Choose Live Jev explicitly when you want to run models. You’ll
              need to reconnect after reloading this page.
            </p>
          </form>
        ) : (
          <>
            <p>
              Add your provider key to the server environment, then restart or
              redeploy.
            </p>
            <label>
              Environment variable
              <code className="p-env-name">
                {provider === "jev" ? "TYPESAFE_API_KEY" : "OPENAI_API_KEY"}
              </code>
            </label>
            <p className="p-field-hint">
              For local development, use the ignored .env.local file. Hosted
              server credentials also require STUDIO_ACCESS_TOKEN. Never put
              keys in project JSON or workflow instructions.
            </p>
          </>
        )}
        <a
          className="p-text-button p-provider-link"
          href={
            provider === "jev"
              ? "https://console.typesafe.ai/keys"
              : "https://platform.openai.com/api-keys"
          }
          target="_blank"
          rel="noreferrer"
        >
          Get a {name} API key <ArrowUpRight size={14} />
        </a>
        {byok && (
          <p className="p-field-hint">
            Prefer complete control?{" "}
            <a
              href="https://github.com/priyankark/jev-state#quickstart"
              target="_blank"
              rel="noreferrer"
            >
              Run your own copy
            </a>
            .{" "}
            <a href="/privacy" target="_blank" rel="noreferrer">
              How data is handled
            </a>
            .
          </p>
        )}
      </div>
    </div>
  );
}
