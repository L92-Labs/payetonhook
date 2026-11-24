import { Github } from "lucide-react";
import LandingDemo from "./LandingDemo";

const REPO_URL = "https://github.com/L92-Labs/payetonhook";

type Feature = {
  id: string;
  title: string;
  body: string;
  meta: string;
  wide?: boolean;
  visual?: "ledger" | "cli";
};

const FEATURES: Feature[] = [
  {
    id: "ingestion",
    title: "Durable ingestion",
    body: "Every delivery lands in D1 with the raw payload preserved in R2. Nothing is lost between the provider's retry and your debugging session.",
    meta: "D1 + R2",
    wide: true,
    visual: "ledger"
  },
  {
    id: "fanout",
    title: "Fan-out delivery",
    body: "Queues fan events out to every endpoint route on a project, with per-attempt status codes and latency.",
    meta: "Queues"
  },
  {
    id: "replay",
    title: "Retries & replay",
    body: "Re-fire any stored event against its endpoint in one click — same payload, same headers, fresh signature.",
    meta: "1-click"
  },
  {
    id: "dlq",
    title: "Dead-letter triage",
    body: "Failed deliveries queue in a first-class dead-letters view: latest failing attempt per target, deep-link to the event, replay from there.",
    meta: "DLQ",
    wide: true
  },
  {
    id: "tunnel",
    title: "Local tunnel CLI",
    body: "relay tunnel --to localhost:3000/webhook streams live events to your machine while the dashboard keeps the ledger.",
    meta: "relay",
    wide: true,
    visual: "cli"
  },
  {
    id: "keys",
    title: "Projects & keys",
    body: "Per-project slugs, endpoint routes, API keys and rate limits — scoped, rotatable, auditable.",
    meta: "1200 req/min"
  }
];

/** Small CSS-built readouts for the wide capability cards. Every token they show is
 *  already stated on this page or in the README; no numbers, no sample data. */
function FeatureVisual({ kind }: { kind: "ledger" | "cli" }) {
  if (kind === "cli") {
    return (
      <code className="landing-readout landing-readout-cli">
        <span className="landing-readout-prompt" aria-hidden="true">$</span> relay tunnel --to http://localhost:3000/webhook
      </code>
    );
  }
  return (
    // Restates the card copy as a picture, so it stays hidden from assistive tech.
    // Rows are divs: a p here would pick up the card paragraph type from .landing-feature p.
    <div className="landing-readout" aria-hidden="true">
      <div className="landing-readout-row">
        <span className="chip">POST</span>
        <code>/in/your-project</code>
      </div>
      <div className="landing-readout-row">
        <span>raw payload</span>
        <span className="landing-readout-arrow">→</span>
        <code>R2</code>
      </div>
      <div className="landing-readout-row">
        <span>event</span>
        <span className="landing-readout-arrow">→</span>
        <code>D1</code>
      </div>
    </div>
  );
}

const FAQ = [
  {
    q: "Is this a hosted service?",
    a: "No. Payetonhook is self-hostable and open source (MIT). This instance runs on your own Cloudflare account — Workers, D1, R2 and Queues. No third party sees your payloads."
  },
  {
    q: "What do I point my provider at?",
    a: "Each project gets ingress URLs like https://api.payetonhook.l92-labs.com/in/your-project. Paste that into Stripe, GitHub, Svix or anything that speaks webhooks."
  },
  {
    q: "How does the local tunnel work?",
    a: "Install the CLI, run relay login once, then relay tunnel --to http://localhost:3000/webhook. Events are delivered live to your dev server over a WebSocket while still being durably recorded."
  },
  {
    q: "What happens when delivery fails?",
    a: "Attempts retry with backoff via Queues. If they keep failing, the event lands in dead letters with the last error, response body and headers, ready to replay once your handler is fixed."
  },
  {
    q: "How long is data kept?",
    a: "Retention is per project (default 30 days) and swept hourly. Payloads beyond the window are removed from R2 and D1 together."
  }
];

export default function LandingView({ loginUrl }: { loginUrl: string }) {
  return (
    <main className="landing">
      <header className="landing-header">
        <a className="landing-brand" href="/">
          payetonhook
        </a>
        <nav className="landing-nav">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#faq">FAQ</a>
          <a className="landing-nav-github" href={REPO_URL}><Github size={15} aria-hidden="true" />GitHub</a>
        </nav>
      </header>

      <section className="landing-hero">
        <p className="eyebrow reveal-1">Webhook control room</p>
        <h1 className="landing-title reveal-1">
          Catch every webhook.
          <br />
          <span className="landing-title-dim">Debug every delivery.</span>
        </h1>
        <p className="landing-sub reveal-2">
          Durable ingestion, fan-out, retries, replay and a local tunnel for the loop
          between a provider&apos;s POST and your handler&apos;s 200. Self-hosted on Cloudflare.
        </p>
        <div className="landing-cta reveal-3">
          <a className="primary-btn login-link" href={loginUrl}>
            Continue with Google
          </a>
          <a className="ghost-btn" href={REPO_URL}><Github size={15} aria-hidden="true" />View source</a>
        </div>
        <LandingDemo />
      </section>

      <section className="landing-shot reveal-4" aria-label="Payetonhook dashboard screenshot">
        <img src="/product-shot.png" alt="The Payetonhook dashboard: event stream on the left, payload, delivery attempts and tunnel forwarding on the right." width={1280} height={800} />
      </section>

      <section className="landing-stats" aria-label="Platform facts">
        <div><strong>30d</strong><span>default retention, swept hourly</span></div>
        <div><strong>1200</strong><span>requests per minute, per project</span></div>
        <div><strong>0</strong><span>third parties between you and your events</span></div>
        <div><strong>MIT</strong><span>license, yours to self-host</span></div>
      </section>

      <section className="landing-features" id="features">
        <p className="eyebrow">Capabilities</p>
        <h2>Everything the loop needs</h2>
        <div className="landing-feature-grid">
          {FEATURES.map((f) => (
            <article
              key={f.id}
              className={`landing-feature ${f.wide ? "wide" : ""} ${f.visual ? "has-visual" : ""}`}
            >
              <div className="landing-feature-copy">
                <span className="landing-feature-meta">{f.meta}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
              {f.visual ? <FeatureVisual kind={f.visual} /> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="landing-how" id="how">
        <p className="eyebrow">How it works</p>
        {/* Three stations on one rail, in the console's node-and-line vocabulary. */}
        <ol className="landing-steps">
          <li>
            <div className="landing-station">
              <span className="landing-station-label">Ingress</span>
              <code>/in/your-project</code>
            </div>
            <span className="landing-step-n">01</span>
            <h3>Point</h3>
            <p>Give your provider the project ingress URL. Any POST, any payload, any headers.</p>
          </li>
          <li>
            <div className="landing-station">
              <span className="landing-station-label">Ledger</span>
              <code>D1 + R2</code>
            </div>
            <span className="landing-step-n">02</span>
            <h3>Inspect</h3>
            <p>Open the dashboard: the event ledger, the raw payload, every attempt with status and latency.</p>
          </li>
          <li>
            <div className="landing-station">
              <span className="landing-station-label">Tunnel</span>
              <code>localhost:3000</code>
            </div>
            <span className="landing-step-n">03</span>
            <h3>Forward</h3>
            <p>Tunnel events to localhost while you code, then replay stored ones when the handler is fixed.</p>
          </li>
        </ol>
      </section>

      <section className="landing-faq" id="faq">
        <p className="eyebrow">FAQ</p>
        <h2>Questions, answered</h2>
        {FAQ.map((item) => (
          <details key={item.q} className="landing-faq-item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </section>

      <section className="landing-final">
        <h2>Your next webhook is already on its way.</h2>
        <p>Be ready for it. Sign in and point a provider at your ingress URL.</p>
        <a className="primary-btn login-link landing-final-btn" href={loginUrl}>
          Continue with Google
        </a>
      </section>

      <footer className="landing-footer">
        <div>
          <span className="landing-footer-brand">L92 Labs</span>
          <span className="muted">payetonhook.l92-labs.com</span>
        </div>
        <div className="landing-footer-links">
          <a href={REPO_URL}>GitHub</a>
          <a href={`${REPO_URL}/blob/main/LICENSE`}>MIT License</a>
          <a href="https://l92-labs.com">l92-labs.com</a>
        </div>
      </footer>
    </main>
  );
}
