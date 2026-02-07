import "./index.css";

const workItems = [
  { title: "Brand System Refresh", src: "/images/editorial/work-1.webp" },
  { title: "Content Ops Buildout", src: "/images/editorial/work-2.webp" },
  { title: "Campaign Launch", src: "/images/editorial/work-3.webp" },
];

export default function App() {
  return (
    <div className="zbm-root">
      <header className="zbm-header">
        <div className="zbm-container zbm-headerRow">
          <a className="zbm-wordmark" href="/" aria-label="Z Best Media">
            Z Best Media
          </a>

          <nav className="zbm-nav" aria-label="Primary">
            <a href="#services" className="zbm-navLink">
              Services
            </a>
            <a href="#work" className="zbm-navLink">
              Work
            </a>
            <a href="#process" className="zbm-navLink">
              Process
            </a>
            <a href="#contact" className="zbm-navLink">
              Contact
            </a>
          </nav>

          <div className="zbm-headerCtas">
            <a className="zbm-btn zbm-btnGhost" href="#audit">
              See how we work
            </a>
            <a className="zbm-btn zbm-btnPrimary" href="#contact">
              Book a 15-minute teardown
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className="zbm-hero" aria-label="Hero">
  <div className="zbm-heroMedia" aria-hidden="true">
    <video
      className="zbm-heroVideo"
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      poster="/images/hero.webp"
    >
      <source src="/video/hero.mp4" type="video/mp4" />
    </video>
    <img className="zbm-heroImg" src="/images/hero.webp" alt="" loading="eager" />
    <div className="zbm-heroMask" />
  </div>

  <div className="zbm-container zbm-heroGrid">
    <div className="zbm-heroCopy">
      <h1 className="zbm-h1">We build brand systems that don’t drift.</h1>
      <p className="zbm-subhead">
        Strategy, identity, and content operations designed to hold up under pressure — across platforms, campaigns,
        and scrutiny.
      </p>

      <div className="zbm-heroNote">Built for operators, not experiments.</div>

      <div className="zbm-heroCtas">
        <a className="zbm-btn zbm-btnPrimary" href="#contact">
          Book a 15-minute teardown
        </a>
        <a className="zbm-btn zbm-btnGhost" href="#audit">
          See how we work
        </a>
      </div>

      <div className="zbm-heroMicrocopy">No decks. No fluff. Just the weakest link and the fix.</div>

      <div className="zbm-trustRow" aria-label="Trust signals">
        <span>Platform-safe</span>
        <span>Operator-grade workflow</span>
        <span>Fast turnaround</span>
      </div>      <div className="zbm-proofRow" aria-label="Proof">
        <span>Strategy → System → Output</span>
        <span>Platform-safe by default</span>
        <span>Built for high-scrutiny seasons</span>
      </div>

      <div className="zbm-proofSignal">Selected work built under live traffic, platform constraints, and zero margin for drift.</div>
      <div className="zbm-proofSignal zbm-proofSignalSub">Internal systems, external scrutiny, repeatable outcomes.</div>

    </div>

    <div className="zbm-heroCard">
      <div className="zbm-card zbm-heroProof">
        <div className="zbm-cardEyebrow">Operator-grade</div>
        <div className="zbm-cardTitle">A content engine that doesn’t drift.</div>
        <p className="zbm-cardBody">
          We build brand systems and weekly execution so your presence stays consistent across every channel—without
          noise.
        </p>

        <div className="zbm-proofList" role="list">
          <div role="listitem">• Brand system + templates</div>
          <div role="listitem">• Content pipeline + scheduling</div>
          <div role="listitem">• Campaign launches + QA</div>
          <div role="listitem">• Tasteful political-season support</div>
        </div>

        <div className="zbm-cardActions">
          <a className="zbm-link" href="#services">
            Explore services →
          </a>
          <a className="zbm-link" href="#audit">
            Get an audit →
          </a>
        </div>
      </div>
    </div>
  </div>
</section>

        <section id="services" className="zbm-section" aria-label="Services">
          <div className="zbm-container">
            <h2 className="zbm-h2">Services</h2>
            <p className="zbm-lead">
              Clear packages. No chaos. Built to ship consistently and safely during high-scrutiny seasons.
            </p>

            <div className="zbm-grid3">
              <div className="zbm-card">
                <div className="zbm-badge">Signal Reset</div>
                <h3 className="zbm-h3">Audit + direction + template system</h3>
                <p className="zbm-p">
                  When your brand feels noisy, inconsistent, or unclear — we rebuild the foundation.
                </p>
              </div>

              <div className="zbm-card">
                <div className="zbm-badge">Content Engine</div>
                <h3 className="zbm-h3">Monthly content operations</h3>
                <p className="zbm-p">
                  A reliable system for producing, approving, and shipping content without chaos.
                </p>
              </div>

              <div className="zbm-card">
                <div className="zbm-badge">Campaign Command</div>
                <h3 className="zbm-h3">Launches + seasonal pushes</h3>
                <p className="zbm-p">
                  Structured launches designed to perform without triggering platform penalties.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="work" className="zbm-section zbm-sectionAlt" aria-label="Work">
          <div className="zbm-container">
            <h2 className="zbm-h2">Work</h2>
            <p className="zbm-lead">A small set of outcomes-focused examples. More coming as we publish.</p>

            <div className="zbm-grid3">
              {workItems.map((w) => (
                <div className="zbm-tile" key={w.title}>
                  <img className="zbm-tileImg" src={w.src} alt="" loading="lazy" />
                  <div className="zbm-tileTitle">{w.title}</div>
                  <div className="zbm-tileMeta">Case study • Summary</div>
                </div>
              ))}
            </div>
          </div>
                    <div className="zbm-midCta">
              <a className="zbm-btn zbm-btnPrimary" href="#contact">Get a teardown</a>
              <div className="zbm-midCtaNote">Most teams find the problem in under 15 minutes.</div>
            </div>
</section>

        <section id="process" className="zbm-section" aria-label="Process">
          <div className="zbm-container">
            <h2 className="zbm-h2">Process</h2>

            <div className="zbm-steps">
              <div className="zbm-step">
                <span>01</span>
                <b>Discover</b>
                <p>Clarify goals, constraints, and channels.</p>
              </div>
              <div className="zbm-step">
                <span>02</span>
                <b>Design</b>
                <p>Build the system: visuals, voice, templates.</p>
              </div>
              <div className="zbm-step">
                <span>03</span>
                <b>Deploy</b>
                <p>Ship content + track signal quality.</p>
              </div>
              <div className="zbm-step">
                <span>04</span>
                <b>Iterate</b>
                <p>Refine based on performance and feedback.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="audit" className="zbm-section zbm-sectionAlt" aria-label="Brand Audit">
          <div className="zbm-container">
            <h2 className="zbm-h2">See how we work</h2>
            <p className="zbm-lead">A fast, structured review with clear fixes. No fluff.</p>

            <div className="zbm-card zbm-formCard">
              <form className="zbm-form" onSubmit={(e) => e.preventDefault()}>
                <label className="zbm-label">
                  Name
                  <input className="zbm-input" placeholder="Your name" autoComplete="name" />
                </label>
                <label className="zbm-label">
                  Email
                  <input className="zbm-input" placeholder="you@company.com" autoComplete="email" />
                </label>
                <label className="zbm-label">
                  Website / Social link
                  <input className="zbm-input" placeholder="https://…" />
                </label>

                <button className="zbm-btn zbm-btnPrimary" type="submit">
                  Request Audit
                </button>

                <p className="zbm-fineprint">
                  Platform-safe by default. We do not create inflammatory content. Taste wins.
                </p>
              </form>
            </div>
          </div>
        </section>

        <section id="contact" className="zbm-section" aria-label="Contact">
          <div className="zbm-container">
            <h2 className="zbm-h2">Book a 15-minute teardown</h2>
            <p className="zbm-lead">Tell us what you’re building. We’ll tell you what to do next.</p>

            <div className="zbm-card zbm-formCard">
              <form className="zbm-form" onSubmit={(e) => e.preventDefault()}>
                <label className="zbm-label">
                  Company / Project
                  <input className="zbm-input" placeholder="Company name" />
                </label>

                <label className="zbm-label">
                  What do you need?
                  <select className="zbm-input" defaultValue="brand">
                    <option value="brand">Brand system</option>
                    <option value="content">Content engine</option>
                    <option value="campaign">Campaign launch</option>
                    <option value="political">Political-season content (tasteful)</option>
                    <option value="wellness">Animal wellness brand push</option>
                  </select>
                </label>

                <label className="zbm-label">
                  Timeline
                  <select className="zbm-input" defaultValue="2-4w">
                    <option value="asap">ASAP</option>
                    <option value="2-4w">2–4 weeks</option>
                    <option value="1-2m">1–2 months</option>
                    <option value="flex">Flexible</option>
                  </select>
                </label>

                <button className="zbm-btn zbm-btnPrimary" type="submit">
                  Submit
                </button>

                <p className="zbm-fineprint">We build premium systems that scale. No gimmicks. No chaos.</p>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="zbm-footer" aria-label="Footer">
        <div className="zbm-container zbm-footerRow">
          <div>
            <div className="zbm-footerMark" aria-hidden="true">
              Z
            </div>
            <div className="zbm-footerName">Z Best Media</div>
            <div className="zbm-footerMeta">Brand systems • Content operations • Campaign execution</div>
          </div>

          <div className="zbm-footerCta">
            <a className="zbm-btn zbm-btnPrimary" href="#contact">Book a teardown</a>
            <a className="zbm-footerLink" href="#process">How we operate</a>
          </div>

          <div className="zbm-footerLinks" aria-label="Footer links">
            <a href="#services">Services</a>
            <a href="#work">Work</a>
            <a href="#process">Process</a>
            <a href="#contact">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
