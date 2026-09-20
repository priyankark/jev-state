import { useEffect, useState } from "react";
import { Workflow, ArrowLeft } from "lucide-react";
import { cloudRequest } from "./cloud-client.js";
import "./product.css";
export function LegalPage() {
  const privacy = location.pathname === "/privacy";
  const [support, setSupport] = useState<string | null>(null);
  useEffect(() => {
    void cloudRequest<{ supportEmail: string | null }>("/session")
      .then((c) => setSupport(c.supportEmail))
      .catch(() => {});
  }, []);
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
        <span className="p-kicker">JEV STATE · HOSTED SERVICE</span>
        <h1>{privacy ? "Privacy & your data" : "Service & billing terms"}</h1>
        <p className="s-policy-date">Updated September 20, 2026</p>
        {privacy ? (
          <>
            <h2>What we store</h2>
            <p>
              Jev State stores your account identity (including email and
              display name), projects, conversation transcripts, evaluation
              results, provider connections, and subscription status. GitHub
              sign-in requests your profile and email; it does not request
              access to your repositories.
            </p>
            <h2>How your data is used</h2>
            <p>
              We use this information to authenticate you, save and run your
              workflows, enforce plan limits, and manage subscriptions.
              Workspaces are private to their account. Provider API keys are
              encrypted on the server and bound to your account. They are not
              included in project exports or returned to the browser after
              saving.
            </p>
            <h2>Services involved</h2>
            <p>
              Vercel hosts the application, Supabase handles authentication and
              database storage, and Dodo Payments handles purchases as merchant
              of record. We store Dodo customer and subscription identifiers;
              payment card details go directly to the payment service.
            </p>
            <p>
              When you choose Live Jev, the conversation and workflow
              instructions are sent to TypeSafe. If you enable generated
              replies, the conversation and agent instructions also go to
              OpenAI. The OpenAI request uses <code>store: false</code>. Each
              provider's own terms and data handling policies apply. Simulation
              does not send conversation content to these model providers.
            </p>
            <h2>Retention and device storage</h2>
            <p>
              The cloud workspace retains up to 60 conversations and 40
              evaluation reports. Older entries are removed from the active
              workspace as new ones are saved. You can export your data at any
              time. Browser storage holds your sign-in session and temporary
              recovery copies of unsynced changes. Self-hosted local mode stores
              its workspace on your device.
            </p>
            <h2>Export and deletion</h2>
            <p>
              Use Plan & account to export your workspace or delete your
              account, projects, history, and saved provider credentials. An
              active or on-hold subscription must be resolved first; contact
              support if you need help with deletion while billing is active.
              Financial records held by Dodo are governed by its retention
              requirements. Infrastructure backups and operational logs may
              remain according to the providers' retention schedules.
            </p>
            <h2>Contact</h2>
            <p>
              For questions about your account or data, contact{" "}
              {support ? (
                <a href={`mailto:${support}`}>{support}</a>
              ) : (
                <a href="https://github.com/priyankark/jev-state">
                  the project maintainer
                </a>
              )}
              . Do not include API keys in messages or public issues.
            </p>
          </>
        ) : (
          <>
            <h2>The service</h2>
            <p>
              Jev State is operated by Priyankar Kumar. The hosted studio lets
              you design, converse with, and evaluate AI workflows. Keep your
              account and provider keys secure, use only data you are authorized
              to process, and follow the terms of connected providers. Model
              judgments and generated replies can be wrong; review results
              before relying on them.
            </p>
            <h2>Free and paid plans</h2>
            <p>
              Free accounts include three cloud projects. Pro includes 100 cloud
              projects. The subscription price, currency, taxes, and billing
              interval are shown before purchase in Dodo checkout. Model API
              usage is separate and billed by your provider. Simulation is
              available without a model API key.
            </p>
            <h2>Subscriptions and cancellation</h2>
            <p>
              Pro renews at the interval shown at checkout until cancelled.
              Manage invoices, payment methods, and cancellation through Plan &
              account → Manage subscription. Scheduled cancellation retains Pro
              while the subscription remains active and the paid period has not
              ended. Failed or expired subscriptions revert to Free. Existing
              projects remain accessible and exportable; adding projects beyond
              your plan limit requires removing projects or upgrading.
            </p>
            <h2>Payments and refunds</h2>
            <p>
              Dodo Payments is the merchant of record for hosted subscriptions.
              Its checkout and purchase terms apply to payment processing. For
              order inquiries or refund requests, use the contact details in
              your Dodo purchase confirmation or contact support below. Nothing
              here limits rights provided by applicable law.
            </p>
            <h2>Limits and availability</h2>
            <p>
              Workflows currently support 12 flat states, conversations up to 20
              turns, and 30 evaluation cases per project with up to five turns
              each. History and request-size limits are described in the
              documentation. Evaluation suites run from your browser and stop if
              the session is closed. No uptime or model-accuracy guarantee is
              offered. Export important results for your own records.
            </p>
            <h2>Open source</h2>
            <p>
              The application source is available under the MIT license. That
              license lets you use, modify, and self-host the software. Hosted
              subscriptions pay for managed access and do not restrict the
              rights granted by the source license.
            </p>
            <h2>Support</h2>
            <p>
              {support ? (
                <a href={`mailto:${support}`}>{support}</a>
              ) : (
                <a href="https://github.com/priyankark/jev-state">
                  Contact the project maintainer
                </a>
              )}
              . The <a href="/privacy">privacy notice</a> explains how account
              and workflow data is handled.
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
