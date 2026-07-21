import type { ATSScore, ResumeContent, TailoringChange } from "../types";

export function formatATSScore(score: ATSScore, isStandalone: boolean = false): string {
  const emoji = score.overallScore >= 85 ? "🟢" : score.overallScore >= 60 ? "🟡" : "🔴";
  const b = score.breakdown;

  if (isStandalone) {
    return `
${emoji} *General ATS Readiness Score: ${score.overallScore}/100*

📊 *Quality & Structure Breakdown:*
├ Format & Header: ${b.formatScore}/100
├ Section Completeness: ${b.sectionCompleteness}/100
├ Bullet Point Impact: ${b.bulletQuality}/100
├ Skill Organization: ${b.keywordMatch}/100
└ Education & Experience Depth: ${b.experienceRelevance}/100

🔑 *Indexed Key Skills (${score.matchedKeywords.length}):*
${score.matchedKeywords.slice(0, 12).join(", ") || "None"}

💡 *Top Improvement Recommendations:*
${score.suggestions
  .slice(0, 5)
  .map((s, i) => `${i + 1}. [${s.priority.toUpperCase()}] ${s.suggestion}`)
  .join("\n")}
`.trim();
  }

  return `
${emoji} *ATS Compatibility Score: ${score.overallScore}/100*

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

/**
 * Send a message to Telegram, splitting it into chunks if it exceeds the limit.
 */
export async function replyInChunks(ctx: any, text: string, options: any = {}): Promise<void> {
  const MAX_LENGTH = 4000;
  if (text.length <= MAX_LENGTH) {
    await ctx.reply(text, options);
    return;
  }

  const lines = text.split("\n");
  let currentChunk = "";

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > MAX_LENGTH) {
      if (currentChunk.trim()) {
        await ctx.reply(currentChunk, options);
      }
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? "\n" : "") + line;
    }
  }

  if (currentChunk.trim()) {
    await ctx.reply(currentChunk, options);
  }
}

/**
 * Convert simple Markdown to Telegram-compatible HTML to avoid parsing crashes.
 * Tokenizes the string to separate code blocks, inline code, and links
 * so that formatting rules (bold/italic) do not overlap with HTML tags.
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return "";

  // Helper to escape HTML characters
  const escape = (str: string) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const parts: { type: "text" | "code_block" | "inline_code" | "link"; content: string; url?: string }[] = [];
  let current = markdown;

  while (current) {
    const codeBlockIndex = current.indexOf("```");
    const inlineCodeIndex = current.indexOf("`");
    const linkMatch = current.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);

    let firstIndex = Infinity;
    let matchType: "code_block" | "inline_code" | "link" | null = null;
    let matchLength = 0;
    let matchContent = "";
    let matchUrl = "";
    let linkIndex = -1;

    if (codeBlockIndex !== -1 && codeBlockIndex < firstIndex) {
      firstIndex = codeBlockIndex;
      matchType = "code_block";
    }
    if (inlineCodeIndex !== -1 && inlineCodeIndex < firstIndex) {
      firstIndex = inlineCodeIndex;
      matchType = "inline_code";
    }
    if (linkMatch && linkMatch.index !== undefined && linkMatch.index < firstIndex) {
      firstIndex = linkMatch.index;
      matchType = "link";
      linkIndex = linkMatch.index;
      matchLength = linkMatch[0].length;
      matchContent = linkMatch[1];
      matchUrl = linkMatch[2];
    }

    if (firstIndex === Infinity) {
      parts.push({ type: "text", content: current });
      break;
    }

    if (firstIndex > 0) {
      parts.push({ type: "text", content: current.substring(0, firstIndex) });
    }

    if (matchType === "code_block") {
      const endCodeBlock = current.indexOf("```", firstIndex + 3);
      if (endCodeBlock !== -1) {
        const block = current.substring(firstIndex + 3, endCodeBlock);
        const cleanBlock = block.replace(/^[a-zA-Z0-9]+\n/, "");
        parts.push({ type: "code_block", content: cleanBlock });
        current = current.substring(endCodeBlock + 3);
      } else {
        parts.push({ type: "text", content: current.substring(firstIndex) });
        break;
      }
    } else if (matchType === "inline_code") {
      const endInlineCode = current.indexOf("`", firstIndex + 1);
      if (endInlineCode !== -1) {
        parts.push({ type: "inline_code", content: current.substring(firstIndex + 1, endInlineCode) });
        current = current.substring(endInlineCode + 1);
      } else {
        parts.push({ type: "text", content: current.substring(firstIndex) });
        break;
      }
    } else if (matchType === "link") {
      parts.push({ type: "link", content: matchContent, url: matchUrl });
      current = current.substring(linkIndex + matchLength);
    }
  }

  return parts
    .map((part) => {
      if (part.type === "code_block") {
        return `<pre>${escape(part.content)}</pre>`;
      }
      if (part.type === "inline_code") {
        return `<code>${escape(part.content)}</code>`;
      }
      if (part.type === "link") {
        return `<a href="${escape(part.url || "")}">${escape(part.content)}</a>`;
      }

      let txt = escape(part.content);
      // Normalize list bullets
      txt = txt.replace(/(^|\n)[*\-+]\s+/g, "$1• ");
      // Bold: *text* or **text**
      txt = txt.replace(/\*\*?([^*]+)\*\*?/g, "<b>$1</b>");
      // Italic: _text_
      txt = txt.replace(/(^|\s)_([^_]+)_(?=\s|$)/g, "$1<i>$2</i>");

      return txt;
    })
    .join("");
}
