import styles from "./page.module.css";

export default function DashboardPage() {
  return (
    <div className={styles.dashboard}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.greeting}>Good evening 👋</h1>
          <p className="text-muted">Here&apos;s an overview of your career progress.</p>
        </div>
        <a href="/dashboard/tailor" className="btn btn-primary">
          ✨ Tailor a Resume
        </a>
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={`card ${styles.statCard}`}>
          <div className={styles.statIcon}>📄</div>
          <div className={styles.statData}>
            <span className={styles.statNumber}>3</span>
            <span className={styles.statLabel}>Resumes</span>
          </div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <div className={styles.statIcon}>🎯</div>
          <div className={styles.statData}>
            <span className={styles.statNumber}>84</span>
            <span className={styles.statLabel}>Avg. ATS Score</span>
          </div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <div className={styles.statIcon}>📋</div>
          <div className={styles.statData}>
            <span className={styles.statNumber}>12</span>
            <span className={styles.statLabel}>Applications</span>
          </div>
        </div>
        <div className={`card ${styles.statCard}`}>
          <div className={styles.statIcon}>✅</div>
          <div className={styles.statData}>
            <span className={styles.statNumber}>4</span>
            <span className={styles.statLabel}>Interviews</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.contentGrid}>
        {/* Quick Actions */}
        <div className={styles.quickActions}>
          <h3 className={styles.sectionTitle}>Quick Actions</h3>
          <div className={styles.actionGrid}>
            <a href="/dashboard/tailor" className={`card ${styles.actionCard}`}>
              <span className={styles.actionIcon}>✨</span>
              <span className={styles.actionLabel}>Tailor Resume</span>
              <span className={styles.actionDesc}>Match to a job description</span>
            </a>
            <a href="/dashboard/resume" className={`card ${styles.actionCard}`}>
              <span className={styles.actionIcon}>📄</span>
              <span className={styles.actionLabel}>Upload Resume</span>
              <span className={styles.actionDesc}>Add a new resume</span>
            </a>
            <a href="/dashboard/skills" className={`card ${styles.actionCard}`}>
              <span className={styles.actionIcon}>🎯</span>
              <span className={styles.actionLabel}>Skills Analysis</span>
              <span className={styles.actionDesc}>Find your gaps</span>
            </a>
            <a href="/dashboard/cover-letter" className={`card ${styles.actionCard}`}>
              <span className={styles.actionIcon}>✉️</span>
              <span className={styles.actionLabel}>Cover Letter</span>
              <span className={styles.actionDesc}>Generate a tailored letter</span>
            </a>
          </div>
        </div>

        {/* Recent Activity */}
        <div className={styles.recentActivity}>
          <h3 className={styles.sectionTitle}>Recent Activity</h3>
          <div className={styles.activityList}>
            <div className={styles.activityItem}>
              <div className={styles.activityDot} style={{ background: "var(--accent-secondary)" }} />
              <div className={styles.activityContent}>
                <span className={styles.activityText}>Resume tailored for <strong>Senior Frontend Engineer</strong></span>
                <span className={styles.activityTime}>2 hours ago</span>
              </div>
              <span className="badge badge-success">Score: 89</span>
            </div>
            <div className={styles.activityItem}>
              <div className={styles.activityDot} style={{ background: "var(--accent-primary)" }} />
              <div className={styles.activityContent}>
                <span className={styles.activityText}>Cover letter generated for <strong>TechCorp Inc.</strong></span>
                <span className={styles.activityTime}>Yesterday</span>
              </div>
            </div>
            <div className={styles.activityItem}>
              <div className={styles.activityDot} style={{ background: "var(--accent-warning)" }} />
              <div className={styles.activityContent}>
                <span className={styles.activityText}>Skills gap analysis: <strong>3 critical gaps</strong> identified</span>
                <span className={styles.activityTime}>2 days ago</span>
              </div>
              <span className="badge badge-warning">Action needed</span>
            </div>
            <div className={styles.activityItem}>
              <div className={styles.activityDot} style={{ background: "var(--accent-info)" }} />
              <div className={styles.activityContent}>
                <span className={styles.activityText}>New resume uploaded: <strong>Software_Engineer_Resume.pdf</strong></span>
                <span className={styles.activityTime}>3 days ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Resume Pipeline Preview */}
      <div className={styles.pipelinePreview}>
        <h3 className={styles.sectionTitle}>AI Agent Pipeline</h3>
        <p className="text-muted" style={{ marginBottom: "var(--space-lg)" }}>
          When you tailor a resume, our agentic AI runs this multi-step pipeline in real-time.
        </p>
        <div className="pipeline">
          <div className="pipeline-step complete">
            <span>📄</span> Parse
          </div>
          <div className="pipeline-connector active" />
          <div className="pipeline-step complete">
            <span>📊</span> Score
          </div>
          <div className="pipeline-connector active" />
          <div className="pipeline-step complete">
            <span>🎯</span> Match
          </div>
          <div className="pipeline-connector" />
          <div className="pipeline-step">
            <span>✍️</span> Rewrite
          </div>
          <div className="pipeline-connector" />
          <div className="pipeline-step">
            <span>📐</span> Build PDF
          </div>
          <div className="pipeline-connector" />
          <div className="pipeline-step">
            <span>✅</span> QA Check
          </div>
        </div>
      </div>
    </div>
  );
}
