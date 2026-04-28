import type { ATSScore, ResumeContent, TailoringChange } from "../types";

export function formatATSScore(score: ATSScore): string {
  const emoji = score.overallScore >= 85 ? "🟢" : score.overallScore >= 60 ? "🟡" : "🔴";
  const b = score.breakdown;

  return `
${emoji} *ATS Score: ${score.overallScore}/100*

📊 *Breakdown:*
├ Keyword Match: ${b.keywordMatch}/100
├ Format Score: ${b.formatScore}/100
├ Experience Relevance: ${b.experienceRelevance}/100
├ Education Alignment: ${b.educationAlignment}/100
├ Section Completeness: ${b.sectionCompleteness}/100
└ Bullet Quality: ${b.bulletQuality}/100

✅ *Matched Keywords (${score.matchedKeywords.length}):*
${score.matchedKeywords.slice(0, 10).join(", ") || "None"}

❌ *Missing Keywords (${score.missingKeywords.length}):*
${score.missingKeywords.slice(0, 10).join(", ") || "None"}

💡 *Top Suggestions:*
${score.suggestions
  .slice(0, 5)
  .map((s, i) => `${i + 1}. [${s.priority.toUpperCase()}] ${s.suggestion}`)
  .join("\n")}
`.trim();
}

export function formatResumeSummary(content: ResumeContent): string {
  const expCount = content.experience.length;
  const eduCount = content.education.length;
  const skillCount = content.skills.reduce((acc, cat) => acc + cat.skills.length, 0);
  const projCount = content.projects.length;

  return `
📄 *Resume Summary*
👤 ${content.personal.fullName}
💼 ${content.personal.title || "Not specified"}
📧 ${content.personal.email}
📍 ${content.personal.location || "Not specified"}

📋 Sections:
├ Experience: ${expCount} ${expCount === 1 ? "entry" : "entries"}
├ Education: ${eduCount} ${eduCount === 1 ? "entry" : "entries"}
├ Skills: ${skillCount} skills across ${content.skills.length} categories
├ Projects: ${projCount}
├ Certifications: ${content.certifications.length}
└ Languages: ${content.languages.length}

${content.summary ? `📝 Summary: ${content.summary.substring(0, 200)}...` : "⚠️ No summary provided"}
`.trim();
}

export function formatTailoringChanges(changes: TailoringChange[]): string {
  if (changes.length === 0) return "No changes suggested.";

  return changes
    .map(
      (c, i) =>
        `*${i + 1}. ${c.section}* (Impact: +${c.impactOnScore}pts)\n` +
        `   📝 ${c.reason}\n` +
        `   Before: _${truncate(c.originalContent, 80)}_\n` +
        `   After: _${truncate(c.suggestedContent, 80)}_`
    )
    .join("\n\n");
}

export function formatChangesSummary(changes: TailoringChange[]): string {
  const totalImpact = changes.reduce((sum, c) => sum + c.impactOnScore, 0);
  const sections = [...new Set(changes.map((c) => c.section))];

  return `
📋 *Changes Summary*
Total changes: ${changes.length}
Sections affected: ${sections.join(", ")}
Estimated score improvement: +${totalImpact} points
  `.trim();
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + "...";
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}
