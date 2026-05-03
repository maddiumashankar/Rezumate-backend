"use client";

import { useState } from "react";
import styles from "./page.module.css";

interface Resume {
  id: string;
  title: string;
  atsScore: number | null;
  updatedAt: string;
  version: number;
  targetRole: string;
}

const DEMO_RESUMES: Resume[] = [
  { id: "r1", title: "Software Engineer Resume", atsScore: 84, updatedAt: "2 hours ago", version: 3, targetRole: "Senior Frontend Engineer" },
  { id: "r2", title: "Product Manager Resume", atsScore: 72, updatedAt: "1 day ago", version: 1, targetRole: "Product Manager" },
  { id: "r3", title: "Full Stack Developer Resume", atsScore: 91, updatedAt: "3 days ago", version: 5, targetRole: "Full Stack Developer" },
];

export default function ResumesPage() {
  const [resumes] = useState<Resume[]>(DEMO_RESUMES);
  const [showUpload, setShowUpload] = useState(false);

  const getScoreColor = (score: number | null) => {
    if (!score) return "var(--text-muted)";
    if (score >= 85) return "var(--accent-secondary)";
    if (score >= 60) return "var(--accent-warning)";
    return "var(--accent-danger)";
  };

  return (
    <div className={styles.resumesPage}>
      <div className={styles.header}>
        <div>
          <h1>📄 My Resumes</h1>
          <p className="text-muted">Manage your resume versions and track optimization progress.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowUpload(!showUpload)}>
          + New Resume
        </button>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className={styles.uploadSection}>
          <div className={`card ${styles.uploadCard}`}>
            <h3>Upload or Create a Resume</h3>
            <p className="text-muted" style={{ marginBottom: "var(--space-lg)" }}>
              Upload a PDF/DOCX, paste text, or start from scratch.
            </p>
            <div className={styles.uploadOptions}>
              <div className={styles.uploadOption}>
                <div className={styles.uploadDropzone}>
                  <span className={styles.uploadIcon}>📁</span>
                  <p>Drop your resume file here</p>
                  <p className="text-muted" style={{ fontSize: "0.75rem" }}>PDF, DOCX, or TXT (max 10MB)</p>
                  <input type="file" accept=".pdf,.docx,.txt" style={{ display: "none" }} id="resume-upload" />
                  <label htmlFor="resume-upload" className="btn btn-secondary btn-sm" style={{ marginTop: "var(--space-sm)" }}>
                    Browse Files
                  </label>
                </div>
              </div>
              <div className={styles.uploadDivider}>or</div>
              <div className={styles.uploadOption}>
                <textarea
                  className="textarea"
                  placeholder="Paste your resume text here..."
                  style={{ minHeight: "180px" }}
                />
                <button className="btn btn-secondary" style={{ width: "100%", marginTop: "var(--space-sm)" }}>
                  Parse from Text
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resume List */}
      <div className={styles.resumeGrid}>
        {resumes.map((resume) => (
          <div key={resume.id} className={`card ${styles.resumeCard}`}>
            <div className={styles.resumeCardTop}>
              <div className={styles.resumeIcon}>📄</div>
              <div className={styles.resumeMeta}>
                <h3 className={styles.resumeTitle}>{resume.title}</h3>
                <p className="text-muted" style={{ fontSize: "0.8125rem" }}>
                  v{resume.version} · Updated {resume.updatedAt}
                </p>
              </div>
              {resume.atsScore && (
                <div className={styles.resumeScore} style={{ color: getScoreColor(resume.atsScore) }}>
                  <span className={styles.resumeScoreNumber}>{resume.atsScore}</span>
                  <span className={styles.resumeScoreLabel}>ATS</span>
                </div>
              )}
            </div>

            {resume.targetRole && (
              <div style={{ marginTop: "var(--space-md)" }}>
                <span className="badge badge-primary">🎯 {resume.targetRole}</span>
              </div>
            )}

            {/* ATS Score Bar */}
            {resume.atsScore && (
              <div style={{ marginTop: "var(--space-md)" }}>
                <div className="progress-bar">
                  <div
                    className={`progress-bar-fill ${resume.atsScore >= 85 ? "progress-success" : resume.atsScore >= 60 ? "progress-warning" : "progress-danger"}`}
                    style={{ width: `${resume.atsScore}%` }}
                  />
                </div>
              </div>
            )}

            <div className={styles.resumeActions}>
              <a href={`/dashboard/tailor?resumeId=${resume.id}`} className="btn btn-primary btn-sm">
                ✨ Tailor
              </a>
              <button className="btn btn-secondary btn-sm">✏️ Edit</button>
              <button className="btn btn-ghost btn-sm">📥 Export</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
