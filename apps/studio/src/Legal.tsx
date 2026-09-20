import { ArrowLeft, Workflow } from "lucide-react";
import "./product.css";

export function LegalPage() {
  const privacy = location.pathname === "/privacy";
  return (
    <div className="s-landing">
      <header>
        <a className="p-brand" href="/">
          <span className="p-logo-icon">
            <Workflow />
          </span>
          <span>
            jev<span>state</span>
          </span>
        </a>
        <a href="/">
          <ArrowLeft size={16} /> Back to studio
        </a>
      </header>
      <article className="s-policy">
        <span className="p-kicker">JEV STATE · OPEN SOURCE</span>
        <h1>{privacy ? "Privacy" : "Open-source terms"}</h1>
        <p className="s-policy-date">Updated September 20, 2026</p>
        {privacy ? (
          <>
            <h2>Local by default</h2>
            <p>
              Jev State does not require an account, hosted database,
              subscription, or payment provider. Projects, conversations, and
              evaluations are stored in your browser unless you export them or
              run your own deployment.
            </p>
            <h2>Model providers</h2>
            <p>
              Simulation stays local. When you choose Live Jev, the workflow and
              conversation are sent to TypeSafe. When you enable generated
              replies, the conversation and agent instructions are sent to
              OpenAI. Provider terms and retention policies apply to those
              requests.
            </p>
            <h2>Credentials</h2>
            <p>
              In a self-hosted deployment, provider keys belong in server-side
              environment variables. Do not put them in client-side variables,
              project exports, screenshots, or public issues.
            </p>
            <h2>Deletion and export</h2>
            <p>
              Clear the site's browser storage to remove local data, or export
              JSON first if you need a backup. A self-hosted operator controls
              any server storage they add.
            </p>
          </>
        ) : (
          <>
            <h2>MIT license</h2>
            <p>
              Jev State is provided under the MIT license in the repository. You
              may use, modify, distribute, and self-host it subject to that
              license.
            </p>
            <h2>Use responsibly</h2>
            <p>
              Model judgments and generated replies can be wrong. Review results
              before relying on them, and only process data you are authorized
              to use. The project provides no uptime, accuracy, or
              provider-availability guarantee.
            </p>
            <h2>Connected services</h2>
            <p>
              TypeSafe and OpenAI are separate services with their own terms,
              pricing, and data handling. Jev State does not collect payments or
              sell subscriptions.
            </p>
            <h2>Source</h2>
            <p>
              Read the source and contribute on{" "}
              <a href="https://github.com/priyankark/jev-state">GitHub</a>.
            </p>
          </>
        )}
      </article>
      <footer>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="https://github.com/priyankark/jev-state">Source code · MIT</a>
      </footer>
    </div>
  );
}
