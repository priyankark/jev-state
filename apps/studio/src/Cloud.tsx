import { useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowRight,
  Check,
  GitBranch,
  Workflow,
  Loader2,
  Cloud,
  CreditCard,
  Download,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { authClient, configureAuth, cloudRequest } from "./cloud-client.js";
import type {
  Project,
  Conversation,
  EvalReport,
} from "../../../packages/core/src/studio.js";
export type Library = {
  projects: Project[];
  conversations: Conversation[];
  reports: EvalReport[];
};
export type CloudWorkspace = {
  user: User;
  library: Library;
  revision: number;
  projectLimit: number;
  plan: string;
};
export type Billing = {
  plan: string;
  projectLimit: number;
  status: string;
  paidUntil: string | null;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  checkoutReady: boolean;
  testMode: boolean;
};
export function CloudGate({
  render,
}: {
  render: (cloud?: CloudWorkspace) => ReactNode;
}) {
  const [authOptions, setAuthOptions] = useState({
    githubEnabled: false,
    emailSignupEnabled: false,
  });
  const [mode, setMode] = useState<"loading" | "local" | "cloud">("loading");
  const [user, setUser] = useState<User | null>(null),
    [workspace, setWorkspace] = useState<CloudWorkspace | null>(null);
  const [error, setError] = useState(""),
    [recover, setRecover] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void cloudRequest<{
      mode?: string;
      supabaseUrl: string;
      supabaseKey: string;
      githubEnabled: boolean;
      emailSignupEnabled: boolean;
    }>("/session")
      .then(async (config) => {
        if (cancelled) return;
        setAuthOptions({
          githubEnabled: config.githubEnabled,
          emailSignupEnabled: config.emailSignupEnabled,
        });
        if (config.mode !== "cloud") {
          setMode("local");
          return;
        }
        if (
          new URLSearchParams(location.hash.slice(1)).get("type") === "recovery"
        )
          setRecover(true);
        const client = configureAuth(config.supabaseUrl, config.supabaseKey);
        const { data } = await client.auth.getSession();
        if (cancelled) return;
        setUser(data.session?.user ?? null);
        setMode("cloud");
        const subscription = client.auth.onAuthStateChange((event, session) => {
          setUser(session?.user ?? null);
          if (event === "PASSWORD_RECOVERY") setRecover(true);
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
      })
      .catch(() =>
        setError("Cannot reach your workspace. Reload to try again."),
      );
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    setWorkspace(null);
    if (!user) return;
    let cancelled = false;
    void cloudRequest<Omit<CloudWorkspace, "user">>("/workspace")
      .then((data) => {
        if (!cancelled) setWorkspace({ ...data, user });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [user?.id]);
  if (mode === "local") return render();
  if (mode === "loading" || (user && !workspace && !recover))
    return (
      <div className="p-loading">
        <Workflow />
        <h2>Opening your workspace</h2>
        <p>{error || "Connecting to your cloud workspace…"}</p>
        {error && (
          <button className="p-button" onClick={() => location.reload()}>
            Try again
          </button>
        )}
      </div>
    );
  if (!user || recover)
    return (
      <AccountAccess
        recover={recover}
        onRecovered={() => setRecover(false)}
        {...authOptions}
      />
    );
  return render(workspace!);
}
function AccountAccess({
  recover,
  onRecovered,
  githubEnabled,
  emailSignupEnabled,
}: {
  recover: boolean;
  githubEnabled: boolean;
  emailSignupEnabled: boolean;
  onRecovered: () => void;
}) {
  const [screen, setScreen] = useState<"signup" | "signin" | "reset">("signup");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const auth = authClient()!.auth;
      if (recover) {
        const r = await auth.updateUser({ password });
        if (r.error) throw r.error;
        onRecovered();
      } else if (screen === "signin") {
        const r = await auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
      } else if (screen === "signup") {
        const r = await auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: location.origin,
          },
        });
        if (r.error) throw r.error;
        if (!r.data.session)
          setMessage("Check your email to confirm your account, then sign in.");
      } else {
        const r = await auth.resetPasswordForEmail(email, {
          redirectTo: location.origin,
        });
        if (r.error) throw r.error;
        setMessage(
          "If an account exists for this email, a password reset link is on its way.",
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
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
        <a
          href="https://github.com/priyankark/jev-state"
          target="_blank"
          rel="noreferrer"
        >
          <GitBranch size={17} /> Open source
        </a>
      </header>
      <main>
        <section className="s-pitch">
          <span className="p-kicker">THE STUDIO FOR STATEFUL AI</span>
          <h1>
            Give your agents
            <br />a sense of direction.
          </h1>
          <p>
            Design a workflow. Have a conversation. See every decision and test
            every path—all in one place.
          </p>
          <div className="s-mini-flow">
            <span>Listen</span>
            <i>→</i>
            <span className="active">
              Understand <small>Jev · 96%</small>
            </span>
            <i>→</i>
            <span>Respond</span>
          </div>
          <small className="s-example">
            Illustrative example · you build your own workflows
          </small>
          <div className="s-benefits">
            <span>
              <Check /> Three free projects
            </span>
            <span>
              <Check /> Multi-turn conversations & evals
            </span>
            <span>
              <Check /> Bring your Jev and OpenAI keys
            </span>
            <span>
              <Check /> Open source. Self-host anytime.
            </span>
          </div>
        </section>
        <section className="s-auth-card">
          <span className="p-kicker">YOUR IDEAS, IN MOTION</span>
          <h2>
            {recover
              ? "Choose a new password"
              : screen === "signup"
                ? "Build your first workflow"
                : screen === "signin"
                  ? "Welcome back"
                  : "Reset your password"}
          </h2>
          <p>
            {screen === "signup"
              ? "Start free. No card required."
              : "Your workspace is right where you left it."}
          </p>
          {!recover && githubEnabled && (
            <button
              className="p-button p-primary p-full"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void authClient()!
                  .auth.signInWithOAuth({
                    provider: "github",
                    options: {
                      redirectTo: location.origin,
                      scopes: "read:user user:email",
                    },
                  })
                  .then((r) => {
                    if (r.error) throw r.error;
                  })
                  .catch((e) => {
                    setError(e.message);
                    setBusy(false);
                  });
              }}
            >
              <GitBranch size={17} /> Continue with GitHub
            </button>
          )}
          {!recover && screen === "signup" && !emailSignupEnabled && (
            <p className="s-billing-note">
              {githubEnabled
                ? "Sign up with your GitHub account. We request your profile and email only—no repository access."
                : "New account signup is being configured. Existing accounts can sign in below."}
            </p>
          )}
          {(recover || screen !== "signup" || emailSignupEnabled) && (
            <form onSubmit={(e) => void submit(e)}>
              {!recover && screen === "signup" && (
                <label>
                  Your name
                  <input
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                  />
                </label>
              )}
              {!recover && (
                <label>
                  Email
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              )}
              {(recover || screen !== "reset") && (
                <label>
                  Password
                  <input
                    required
                    type="password"
                    minLength={screen === "signup" || recover ? 12 : 1}
                    autoComplete={
                      screen === "signin" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {(screen === "signup" || recover) && (
                    <small>At least 12 characters</small>
                  )}
                </label>
              )}
              {error && (
                <p className="p-inline-error" role="alert">
                  {error}
                </p>
              )}
              {message && (
                <p className="s-success" role="status">
                  {message}
                </p>
              )}
              <button className="p-button p-primary" disabled={busy}>
                {busy ? (
                  <Loader2 className="spin" size={16} />
                ) : (
                  <ArrowRight size={16} />
                )}{" "}
                {recover
                  ? "Save password"
                  : screen === "signup"
                    ? "Create free account"
                    : screen === "signin"
                      ? "Sign in"
                      : "Send reset link"}
              </button>
            </form>
          )}
          {!recover && (
            <div className="s-auth-links">
              <button
                onClick={() => {
                  setScreen(screen === "signin" ? "signup" : "signin");
                  setError("");
                  setMessage("");
                }}
              >
                {screen === "signin"
                  ? "New here? Create an account"
                  : "Already have an account? Sign in"}
              </button>
              {screen === "signin" && emailSignupEnabled && (
                <button onClick={() => setScreen("reset")}>
                  Forgot password?
                </button>
              )}
            </div>
          )}
          <small>
            Your projects are private to your account. API keys are encrypted on
            the server. Model usage is billed by your provider.
          </small>
        </section>
      </main>
      <footer>
        <span>Built with Jev. Made for developers.</span>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a
          href="https://github.com/priyankark/jev-state/blob/main/LICENSE"
          target="_blank"
          rel="noreferrer"
        >
          MIT licensed
        </a>
      </footer>
    </div>
  );
}
export function useCloudSync(
  cloud: CloudWorkspace | undefined,
  library: Library,
) {
  const [recovery, setRecovery] = useState<unknown | null>(() => {
    if (!cloud) return null;
    try {
      const archived = localStorage.getItem(`jev-recovery-${cloud.user.id}`);
      const unsynced = localStorage.getItem(`jev-unsynced-${cloud.user.id}`);
      const candidate = archived || unsynced;
      if (!candidate || candidate === JSON.stringify(library)) return null;
      const parsed: unknown = JSON.parse(candidate);
      localStorage.setItem(`jev-recovery-${cloud.user.id}`, candidate);
      return parsed;
    } catch {
      return null;
    }
  });
  const [status, setStatus] = useState(
      cloud ? "Saved to cloud" : "Saved on this device",
    ),
    [error, setError] = useState("");
  const latest = useRef(library),
    saved = useRef(JSON.stringify(library)),
    revision = useRef(cloud?.revision ?? 0);
  const running = useRef<Promise<void> | null>(null),
    halted = useRef(false);
  latest.current = library;
  async function flush(): Promise<boolean> {
    if (!cloud) return true;
    if (halted.current) return false;
    if (running.current) {
      await running.current;
      return flush();
    }
    const serialized = JSON.stringify(latest.current);
    if (serialized === saved.current) return true;
    setStatus("Saving to cloud…");
    const task = (async () => {
      try {
        const data = await cloudRequest<{ revision: number }>("/workspace", {
          revision: revision.current,
          library: JSON.parse(serialized),
        });
        revision.current = data.revision;
        saved.current = serialized;
        setStatus("Saved to cloud");
        setError("");
        if (serialized === JSON.stringify(latest.current))
          localStorage.removeItem(`jev-unsynced-${cloud.user.id}`);
      } catch (e) {
        halted.current = true;
        setError((e as Error).message);
        setStatus("Changes not synced");
      }
    })();
    running.current = task;
    await task;
    running.current = null;
    if (!halted.current && saved.current !== JSON.stringify(latest.current))
      return flush();
    return !halted.current;
  }
  useEffect(() => {
    if (!cloud) return;
    if (JSON.stringify(library) === saved.current) return;
    setStatus(halted.current ? "Changes not synced" : "Saving to cloud…");
    try {
      localStorage.setItem(
        `jev-unsynced-${cloud.user.id}`,
        JSON.stringify(library),
      );
    } catch {
      setError(
        "Device backup is full. Keep this page open until cloud saving finishes.",
      );
    }
    const timer = setTimeout(() => void flush(), 350);
    return () => clearTimeout(timer);
  }, [library]);
  useEffect(() => {
    if (!cloud) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (saved.current !== JSON.stringify(latest.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  return {
    status,
    error,
    recovery,
    discardRecovery: () => {
      if (cloud) localStorage.removeItem(`jev-recovery-${cloud.user.id}`);
      setRecovery(null);
    },
    flush,
    retry: () => {
      halted.current = false;
      return flush();
    },
  };
}
export function BillingPage({
  cloud,
  library,
  onError,
  onPlanUpdate,
}: {
  cloud: CloudWorkspace;
  library: Library;
  onError: (e: string) => void;
  onPlanUpdate: (n: number) => void;
}) {
  const [billing, setBilling] = useState<Billing | null>(null),
    [busy, setBusy] = useState(false),
    [price, setPrice] = useState("");
  async function refresh() {
    try {
      const next = await cloudRequest<Billing>("/billing");
      setBilling(next);
      onPlanUpdate(next.projectLimit);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
    void cloudRequest<{
      available: boolean;
      price?: {
        currency: string;
        price: number;
        payment_frequency_interval?: string;
        payment_frequency_count?: number;
      };
    }>("/billing/price")
      .then((r) => {
        if (r.available && r.price) {
          const p = r.price;
          setPrice(
            `${new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency }).format(p.price / 100)} / ${p.payment_frequency_count === 1 ? "" : p.payment_frequency_count + " "}${p.payment_frequency_interval?.toLowerCase() || "month"}`,
          );
        }
      })
      .catch(() => {});
  }, []);
  async function redirect(path: string) {
    setBusy(true);
    try {
      const r = await cloudRequest<{ url: string }>(path, {});
      location.assign(r.url);
    } catch (e) {
      onError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <div className="p-page">
      <div className="p-page-heading">
        <div>
          <span className="p-kicker">ROOM TO BUILD</span>
          <h1>Plan & account</h1>
          <p>{cloud.user.email} · Your private cloud workspace</p>
        </div>
        <button className="p-button" onClick={() => void refresh()}>
          <RefreshCw size={15} /> Refresh status
        </button>
      </div>
      {billing?.testMode && billing.checkoutReady && (
        <div className="s-test-banner">
          Billing is in test mode. Checkout uses test payments; no real
          subscription is charged.
        </div>
      )}
      {new URLSearchParams(location.search).has("billing") && (
        <div className="s-test-banner">
          Back from billing? Your plan updates after Dodo confirms the
          subscription. Refresh status in a moment.
        </div>
      )}
      <div className="s-plans">
        <section className="s-plan">
          <span className="p-kicker">FREE</span>
          <h2>A place to start.</h2>
          <strong className="s-price">
            $0 <small>forever</small>
          </strong>
          <p>Explore an idea from its first state to its final evaluation.</p>
          <ul>
            <li>3 cloud projects</li>
            <li>Visual state machine editor</li>
            <li>Multi-turn conversations and evaluations</li>
            <li>Personal Jev and OpenAI connections</li>
            <li>Import and export your projects</li>
          </ul>
          <div className="s-plan-bottom">
            {library.projects.length} projects ·{" "}
            {billing?.plan === "free"
              ? "Current plan"
              : "Available after cancellation"}
          </div>
        </section>
        <section className="s-plan s-pro">
          <span className="p-kicker">PRO</span>
          <h2>Keep the ideas coming.</h2>
          <strong className="s-price">{price || "Coming soon"}</strong>
          <p>More space for your workflows, experiments, and agent projects.</p>
          <ul>
            <li>100 cloud projects</li>
            <li>Everything in Free</li>
            <li>Cloud conversation and evaluation history</li>
            <li>Manage invoices and cancellation through Dodo</li>
            <li>Your projects remain exportable if you downgrade</li>
          </ul>
          <button
            className="p-button p-primary"
            disabled={
              busy || !billing?.checkoutReady || billing?.plan === "pro"
            }
            onClick={() => void redirect("/billing/checkout")}
          >
            <CreditCard size={16} />
            {billing?.plan === "pro"
              ? "Your current plan"
              : billing?.checkoutReady
                ? "Upgrade to Pro"
                : "Subscriptions opening soon"}
          </button>
        </section>
      </div>
      <p className="s-billing-note">
        Model usage is billed separately by Jev and OpenAI. Both plans retain
        your latest 60 conversations and 40 evaluation reports. Export results
        for longer retention.
      </p>
      <section className="s-account-row">
        <div>
          <h3>Subscription</h3>
          <p>
            {billing?.plan === "pro"
              ? `Pro ${billing.cancelAtPeriodEnd ? "ends" : "renews"} ${billing.paidUntil ? new Date(billing.paidUntil).toLocaleDateString() : ""}`
              : "Free plan · no subscription required"}
          </p>
        </div>
        {billing?.canManage && (
          <button
            className="p-button"
            disabled={busy}
            onClick={() => void redirect("/billing/portal")}
          >
            Manage subscription
          </button>
        )}
      </section>
      <section className="s-account-row">
        <div>
          <h3>Open source, on your terms.</h3>
          <p>
            Run Jev State on your own infrastructure with no subscription or
            project limit.
          </p>
        </div>
        <a
          className="p-button"
          href="https://github.com/priyankark/jev-state"
          target="_blank"
          rel="noreferrer"
        >
          <GitBranch size={16} /> Self-host
        </a>
      </section>
      <section className="s-account-row">
        <div>
          <h3>Export your workspace</h3>
          <p>Download your projects, conversations, and evaluation reports.</p>
        </div>
        <button
          className="p-button"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(library, null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "jev-state-workspace.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download size={16} /> Export everything
        </button>
      </section>
      <section className="s-account-row">
        <div>
          <h3>Delete account</h3>
          <p>
            Permanently delete your projects, history, and saved provider keys.
            Export your work first.
          </p>
        </div>
        <button
          className="p-button"
          onClick={() => {
            const email = window.prompt(
              "This permanently deletes your account and workspace. Enter your account email to confirm.",
            );
            if (!email) return;
            void cloudRequest("/account/delete", { email })
              .then(() => authClient()!.auth.signOut())
              .catch((e) => onError(e.message));
          }}
        >
          Delete account
        </button>
      </section>
      <section className="s-account-row">
        <div>
          <h3>Sign out</h3>
          <p>Your saved projects will be here when you return.</p>
        </div>
        <button
          className="p-button"
          onClick={() => void authClient()!.auth.signOut()}
        >
          <LogOut size={16} /> Sign out
        </button>
      </section>
    </div>
  );
}
