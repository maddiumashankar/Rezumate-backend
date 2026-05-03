"use client";

import { useState } from "react";
import styles from "./page.module.css";

type JobStatus = "draft" | "applied" | "screening" | "interview" | "offer" | "rejected";

interface Job {
  id: string;
  company: string;
  title: string;
  status: JobStatus;
  atsScore: number | null;
  appliedDate: string | null;
  notes: string;
}

const STATUS_CONFIG: Record<JobStatus, { label: string; icon: string; color: string }> = {
  draft: { label: "Draft", icon: "📝", color: "var(--text-muted)" },
  applied: { label: "Applied", icon: "📨", color: "var(--accent-info)" },
  screening: { label: "Screening", icon: "🔍", color: "var(--accent-primary)" },
  interview: { label: "Interview", icon: "🎤", color: "var(--accent-warning)" },
  offer: { label: "Offer", icon: "🎉", color: "var(--accent-secondary)" },
  rejected: { label: "Rejected", icon: "❌", color: "var(--accent-danger)" },
};

const DEMO_JOBS: Job[] = [
  { id: "j1", company: "TechCorp", title: "Senior Frontend Engineer", status: "interview", atsScore: 89, appliedDate: "2026-04-20", notes: "Phone screen passed" },
  { id: "j2", company: "DataFlow Inc.", title: "Full Stack Developer", status: "applied", atsScore: 84, appliedDate: "2026-04-25", notes: "" },
  { id: "j3", company: "CloudBase", title: "React Engineer", status: "screening", atsScore: 91, appliedDate: "2026-04-22", notes: "Recruiter reached out" },
  { id: "j4", company: "StartupXYZ", title: "Software Engineer", status: "draft", atsScore: null, appliedDate: null, notes: "Need to tailor resume" },
  { id: "j5", company: "MegaSoft", title: "Senior Developer", status: "rejected", atsScore: 72, appliedDate: "2026-04-10", notes: "Position filled" },
  { id: "j6", company: "InnovateLab", title: "Lead Engineer", status: "offer", atsScore: 94, appliedDate: "2026-04-05", notes: "$180K base + equity" },
];

const KANBAN_COLUMNS: JobStatus[] = ["draft", "applied", "screening", "interview", "offer", "rejected"];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>(DEMO_JOBS);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [showAddForm, setShowAddForm] = useState(false);

  const moveJob = (jobId: string, newStatus: JobStatus) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
    );
  };

  const getJobsByStatus = (status: JobStatus) => jobs.filter((j) => j.status === status);

  const stats = {
    total: jobs.length,
    active: jobs.filter((j) => !["rejected", "offer"].includes(j.status)).length,
    interviews: jobs.filter((j) => j.status === "interview").length,
    offers: jobs.filter((j) => j.status === "offer").length,
    responseRate: jobs.length > 0
      ? Math.round(
          (jobs.filter((j) => ["screening", "interview", "offer"].includes(j.status)).length / jobs.length) * 100
        )
      : 0,
  };

  return (
    <div className={styles.jobsPage}>
      <div className={styles.header}>
        <div>
          <h1>📋 Job Tracker</h1>
          <p className="text-muted">Track your job applications from draft to offer.</p>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.viewToggle}>
            <button
              className={`btn btn-sm ${viewMode === "kanban" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("kanban")}
            >
              Kanban
            </button>
            <button
              className={`btn btn-sm ${viewMode === "list" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setViewMode("list")}
            >
              List
            </button>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
            + Add Application
          </button>
        </div>
      </div>

      {/* Stats Row */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{stats.total}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{stats.active}</span>
          <span className={styles.statLabel}>Active</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{stats.interviews}</span>
          <span className={styles.statLabel}>Interviews</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{stats.offers}</span>
          <span className={styles.statLabel}>Offers</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum} style={{ color: "var(--accent-secondary)" }}>{stats.responseRate}%</span>
          <span className={styles.statLabel}>Response Rate</span>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <div className={`card ${styles.addForm}`}>
          <h3>Add Job Application</h3>
          <div className={styles.formGrid}>
            <div className="input-group">
              <label className="input-label">Company</label>
              <input className="input" placeholder="e.g., Google" />
            </div>
            <div className="input-group">
              <label className="input-label">Job Title</label>
              <input className="input" placeholder="e.g., Senior Software Engineer" />
            </div>
            <div className="input-group">
              <label className="input-label">Job URL</label>
              <input className="input" placeholder="https://..." />
            </div>
            <div className="input-group">
              <label className="input-label">Status</label>
              <select className="select">
                {KANBAN_COLUMNS.map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">Job Description (optional)</label>
            <textarea className="textarea" placeholder="Paste the JD for ATS scoring..." />
          </div>
          <div style={{ display: "flex", gap: "var(--space-sm)", justifyContent: "flex-end" }}>
            <button className="btn btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
            <button className="btn btn-primary">Add Application</button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {viewMode === "kanban" && (
        <div className={styles.kanban}>
          {KANBAN_COLUMNS.map((status) => {
            const columnJobs = getJobsByStatus(status);
            const config = STATUS_CONFIG[status];

            return (
              <div key={status} className={styles.kanbanColumn}>
                <div className={styles.columnHeader}>
                  <span>{config.icon} {config.label}</span>
                  <span className={styles.columnCount}>{columnJobs.length}</span>
                </div>
                <div className={styles.columnCards}>
                  {columnJobs.map((job) => (
                    <div key={job.id} className={styles.jobCard}>
                      <div className={styles.jobCompany}>{job.company}</div>
                      <div className={styles.jobTitle}>{job.title}</div>
                      {job.atsScore && (
                        <div className={styles.jobScore}>
                          <span>ATS:</span>
                          <span style={{ color: job.atsScore >= 85 ? "var(--accent-secondary)" : job.atsScore >= 60 ? "var(--accent-warning)" : "var(--accent-danger)" }}>
                            {job.atsScore}
                          </span>
                        </div>
                      )}
                      {job.appliedDate && (
                        <div className={styles.jobDate}>📅 {new Date(job.appliedDate).toLocaleDateString()}</div>
                      )}
                      {job.notes && (
                        <div className={styles.jobNotes}>{job.notes}</div>
                      )}
                      <div className={styles.jobCardActions}>
                        {status !== "rejected" && status !== "offer" && (
                          <select
                            className={styles.statusSelect}
                            value={status}
                            onChange={(e) => moveJob(job.id, e.target.value as JobStatus)}
                          >
                            {KANBAN_COLUMNS.map((s) => (
                              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                  {columnJobs.length === 0 && (
                    <div className={styles.emptyColumn}>No applications</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <div className={styles.listView}>
          <div className={styles.listHeader}>
            <span>Company</span>
            <span>Title</span>
            <span>Status</span>
            <span>ATS Score</span>
            <span>Applied</span>
          </div>
          {jobs.map((job) => {
            const config = STATUS_CONFIG[job.status];
            return (
              <div key={job.id} className={styles.listRow}>
                <span className={styles.listCompany}>{job.company}</span>
                <span>{job.title}</span>
                <span>
                  <span className="badge badge-primary">{config.icon} {config.label}</span>
                </span>
                <span style={{ color: job.atsScore && job.atsScore >= 85 ? "var(--accent-secondary)" : "var(--text-secondary)" }}>
                  {job.atsScore || "—"}
                </span>
                <span className="text-muted">
                  {job.appliedDate ? new Date(job.appliedDate).toLocaleDateString() : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
