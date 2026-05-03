"use client";

import { useState } from "react";
import styles from "./sidebar.module.css";

interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊", href: "/dashboard" },
  { id: "resumes", label: "My Resumes", icon: "📄", href: "/dashboard/resume" },
  { id: "tailor", label: "Tailor Resume", icon: "✨", href: "/dashboard/tailor" },
  { id: "jobs", label: "Job Tracker", icon: "📋", href: "/dashboard/jobs" },
  { id: "skills", label: "Skills Analysis", icon: "🎯", href: "/dashboard/skills" },
  { id: "cover-letter", label: "Cover Letter", icon: "✉️", href: "/dashboard/cover-letter" },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: "settings", label: "Settings", icon: "⚙️", href: "/dashboard/settings" },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      {/* Brand */}
      <div className={styles.brand}>
        <span className={styles.brandIcon}>📄</span>
        {!collapsed && <span className={styles.brandText}>Rezumate</span>}
        <button
          className={styles.collapseBtn}
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "→" : "←"}
        </button>
      </div>

      {/* Main Nav */}
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={styles.navItem}
            title={collapsed ? item.label : undefined}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
          </a>
        ))}
      </nav>

      {/* Spacer */}
      <div className={styles.spacer} />

      {/* Bottom Nav */}
      <nav className={styles.bottomNav}>
        {BOTTOM_ITEMS.map((item) => (
          <a
            key={item.id}
            href={item.href}
            className={styles.navItem}
            title={collapsed ? item.label : undefined}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
          </a>
        ))}

        {/* User */}
        <div className={styles.userSection}>
          <div className={styles.userAvatar}>U</div>
          {!collapsed && (
            <div className={styles.userInfo}>
              <span className={styles.userName}>User</span>
              <span className={styles.userPlan}>Free Plan</span>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
