import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <div className={styles.landing}>
      {/* ── Navigation ── */}
      <nav className={styles.nav}>
        <div className={styles.navInner}>
          <a href="/" className={styles.logo}>
            <span className={styles.logoIcon}>📄</span>
            <span className={styles.logoText}>Rezumate</span>
          </a>
          <div className={styles.navLinks}>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#how-it-works" className={styles.navLink}>How it Works</a>
            <a href="#pricing" className={styles.navLink}>Pricing</a>
            <a href="/dashboard" className="btn btn-primary">Launch App →</a>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroGlow} />
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} />
            Powered by AI Agents — Not a Chatbot
          </div>
          <h1 className={styles.heroTitle}>
            Your Resume,{" "}
            <span className="gradient-text">Perfected by AI</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Rezumate is an intelligent AI agent that analyzes job descriptions,
            tailors your resume for maximum ATS compatibility, and tracks your
            entire job search — all from one beautiful interface.
          </p>
          <div className={styles.heroCTA}>
            <a href="/dashboard" className="btn btn-primary btn-lg">
              Get Started — It&apos;s Free
            </a>
            <a href="#how-it-works" className="btn btn-secondary btn-lg">
              See How It Works
            </a>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <span className={styles.heroStatNumber}>94%</span>
              <span className={styles.heroStatLabel}>Avg. ATS Score</span>
            </div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatNumber}>2.3x</span>
              <span className={styles.heroStatLabel}>More Interviews</span>
            </div>
            <div className={styles.heroStatDivider} />
            <div className={styles.heroStat}>
              <span className={styles.heroStatNumber}>30s</span>
              <span className={styles.heroStatLabel}>Avg. Tailor Time</span>
            </div>
          </div>
        </div>

        {/* Hero Mockup */}
        <div className={styles.heroMockup}>
          <div className={styles.mockupWindow}>
            <div className={styles.mockupHeader}>
              <div className={styles.mockupDots}>
                <span /><span /><span />
              </div>
              <span className={styles.mockupTitle}>Rezumate — Tailoring Workspace</span>
            </div>
            <div className={styles.mockupBody}>
              <div className={styles.mockupScore}>
                <div className={styles.mockupScoreRing}>
                  <svg viewBox="0 0 120 120" width="100" height="100">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke="url(#scoreGrad)" strokeWidth="8" strokeLinecap="round" strokeDasharray="314" strokeDashoffset="50" style={{ transform: "rotate(-90deg)", transformOrigin: "center" }} />
                    <defs>
                      <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#818cf8" />
                        <stop offset="100%" stopColor="#34d399" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className={styles.mockupScoreText}>
                    <span className={styles.mockupScoreNum}>84</span>
                    <span className={styles.mockupScoreLbl}>ATS</span>
                  </div>
                </div>
                <div className={styles.mockupScoreMeta}>
                  <div className={styles.mockupScoreChange}>↑ +23 pts</div>
                  <div className={styles.mockupScoreLabel}>from original</div>
                </div>
              </div>
              <div className={styles.mockupPipeline}>
                <div className={`${styles.mockupStep} ${styles.complete}`}>✓ Parse</div>
                <div className={styles.mockupConnector} />
                <div className={`${styles.mockupStep} ${styles.complete}`}>✓ Score</div>
                <div className={styles.mockupConnector} />
                <div className={`${styles.mockupStep} ${styles.active}`}>⚡ Rewrite</div>
                <div className={styles.mockupConnector} />
                <div className={styles.mockupStep}>Build</div>
              </div>
              <div className={styles.mockupChanges}>
                <div className={styles.mockupChange}>
                  <span className={styles.mockupChangeIcon}>✏️</span>
                  <span>Enhanced 4 bullet points with action verbs</span>
                </div>
                <div className={styles.mockupChange}>
                  <span className={styles.mockupChangeIcon}>🎯</span>
                  <span>Added 6 missing keywords from JD</span>
                </div>
                <div className={styles.mockupChange}>
                  <span className={styles.mockupChangeIcon}>📝</span>
                  <span>Rewrote summary for target role</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className={styles.features}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>
            Not Just a Tool. <span className="gradient-text">An Agent.</span>
          </h2>
          <p className={styles.sectionSubtitle}>
            Rezumate doesn&apos;t just format — it thinks, analyzes, and acts on your behalf.
          </p>

          <div className={styles.featureGrid}>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon}>🤖</div>
              <h3>Agentic AI Pipeline</h3>
              <p className="text-muted">
                Multi-step AI workflow: parse → score → match → rewrite → build.
                Self-corrects until your score hits 85+.
              </p>
            </div>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon}>🎯</div>
              <h3>Real ATS Scoring</h3>
              <p className="text-muted">
                Tokenized keyword matching with stemming, synonym expansion, and
                word-boundary safety. No more false positives.
              </p>
            </div>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon}>✨</div>
              <h3>Per-Change Approval</h3>
              <p className="text-muted">
                Review each suggested change individually. Accept, reject, or
                modify — see live score impact before committing.
              </p>
            </div>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon}>📊</div>
              <h3>Skills Gap Analysis</h3>
              <p className="text-muted">
                Visual radar chart showing your skills vs. job requirements.
                Learning recommendations with free resources.
              </p>
            </div>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon}>✉️</div>
              <h3>Cover Letter Agent</h3>
              <p className="text-muted">
                Generates tailored cover letters that reference your actual
                experience and the specific JD — not generic filler.
              </p>
            </div>
            <div className={`card ${styles.featureCard}`}>
              <div className={styles.featureIcon}>📋</div>
              <h3>Job Tracker</h3>
              <p className="text-muted">
                Kanban board for your job applications. Track status, deadlines,
                and analytics across your entire search.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it Works ── */}
      <section id="how-it-works" className={styles.howItWorks}>
        <div className={styles.sectionInner}>
          <h2 className={styles.sectionTitle}>
            Three Steps to a <span className="gradient-text">Perfect Resume</span>
          </h2>

          <div className={styles.steps}>
            <div className={styles.step}>
              <div className={styles.stepNumber}>1</div>
              <div className={styles.stepContent}>
                <h3>Upload Your Resume</h3>
                <p className="text-muted">
                  Drop your PDF, DOCX, or paste text. Our AI parses every section
                  into structured data in seconds.
                </p>
              </div>
            </div>
            <div className={styles.stepConnector} />
            <div className={styles.step}>
              <div className={styles.stepNumber}>2</div>
              <div className={styles.stepContent}>
                <h3>Paste the Job Description</h3>
                <p className="text-muted">
                  The agent analyzes the JD, extracts requirements, and identifies
                  exactly what&apos;s missing from your resume.
                </p>
              </div>
            </div>
            <div className={styles.stepConnector} />
            <div className={styles.step}>
              <div className={styles.stepNumber}>3</div>
              <div className={styles.stepContent}>
                <h3>Review & Export</h3>
                <p className="text-muted">
                  Approve changes one by one, watch your ATS score climb, and
                  download a perfectly tailored PDF.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.cta}>
        <div className={styles.ctaGlow} />
        <div className={styles.ctaContent}>
          <h2>Ready to Land More Interviews?</h2>
          <p className="text-muted">
            Join thousands of job seekers who use Rezumate to tailor their resumes.
            Free forever for core features.
          </p>
          <a href="/dashboard" className="btn btn-primary btn-lg">
            Start Tailoring Your Resume →
          </a>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <span className={styles.logo}>
              <span className={styles.logoIcon}>📄</span>
              <span className={styles.logoText}>Rezumate</span>
            </span>
            <p className="text-muted" style={{ marginTop: "8px", fontSize: "0.8125rem" }}>
              AI-powered resume optimization agent.
              <br />
              Open source. Zero cost. Maximum impact.
            </p>
          </div>
          <div className={styles.footerLinks}>
            <a href="https://github.com/maddiumashankar/Rezumate-backend" className="text-muted">GitHub</a>
            <a href="#features" className="text-muted">Features</a>
            <a href="#how-it-works" className="text-muted">How it Works</a>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <p className="text-muted" style={{ fontSize: "0.75rem" }}>
            © 2026 Rezumate. Built with ❤️ by Umashankar Maddi.
          </p>
        </div>
      </footer>
    </div>
  );
}
