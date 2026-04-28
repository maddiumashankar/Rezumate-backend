import type { ResumeContent, JDKeywordAnalysis, ATSScore, ATSBreakdown, ATSSuggestion } from "../types";

/**
 * Calculate ATS compatibility score between a resume and job description keywords.
 * Hybrid approach: algorithmic keyword matching + heuristic section analysis.
 */
export function calculateATSScore(resume: ResumeContent, jdAnalysis: JDKeywordAnalysis): ATSScore {
  const resumeText = extractAllText(resume).toLowerCase();
  const resumeSkills = extractAllSkills(resume).map((s) => s.toLowerCase());

  // 1. Keyword Match (40% weight)
  const { matched: matchedRequired, missing: missingRequired } = matchKeywords(resumeText, resumeSkills, jdAnalysis.requiredSkills);
  const { matched: matchedPreferred } = matchKeywords(resumeText, resumeSkills, jdAnalysis.preferredSkills);
  const { matched: matchedGeneral } = matchKeywords(resumeText, resumeSkills, jdAnalysis.keywords);

  const requiredScore = jdAnalysis.requiredSkills.length > 0
    ? (matchedRequired.length / jdAnalysis.requiredSkills.length) * 100 : 100;
  const preferredScore = jdAnalysis.preferredSkills.length > 0
    ? (matchedPreferred.length / jdAnalysis.preferredSkills.length) * 100 : 100;
  const generalScore = jdAnalysis.keywords.length > 0
    ? (matchedGeneral.length / jdAnalysis.keywords.length) * 100 : 100;

  const keywordMatch = Math.round(requiredScore * 0.6 + preferredScore * 0.25 + generalScore * 0.15);

  // 2. Format Score (15% weight)
  const formatScore = calculateFormatScore(resume);

  // 3. Experience Relevance (20% weight)
  const experienceRelevance = calculateExperienceRelevance(resume, jdAnalysis);

  // 4. Education Alignment (10% weight)
  const educationAlignment = calculateEducationAlignment(resume, jdAnalysis);

  // 5. Section Completeness (10% weight)
  const sectionCompleteness = calculateSectionCompleteness(resume);

  // 6. Bullet Quality (5% weight)
  const bulletQuality = calculateBulletQuality(resume);

  // Overall weighted score
  const overallScore = Math.round(
    keywordMatch * 0.40 +
    formatScore * 0.15 +
    experienceRelevance * 0.20 +
    educationAlignment * 0.10 +
    sectionCompleteness * 0.10 +
    bulletQuality * 0.05
  );

  const breakdown: ATSBreakdown = {
    keywordMatch,
    formatScore,
    experienceRelevance,
    educationAlignment,
    sectionCompleteness,
    bulletQuality,
  };

  // Generate suggestions
  const suggestions = generateSuggestions(resume, jdAnalysis, breakdown, missingRequired);

  // All matched/missing keywords
  const allMatched = [...new Set([...matchedRequired, ...matchedPreferred, ...matchedGeneral])];
  const allMissing = [...new Set([...missingRequired, ...jdAnalysis.preferredSkills.filter((s) => !matchedPreferred.includes(s))])];

  return {
    overallScore: Math.min(100, Math.max(0, overallScore)),
    breakdown,
    suggestions,
    matchedKeywords: allMatched,
    missingKeywords: allMissing,
  };
}

function matchKeywords(resumeText: string, resumeSkills: string[], keywords: string[]): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (resumeText.includes(kwLower) || resumeSkills.some((s) => s.includes(kwLower) || kwLower.includes(s))) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }

  return { matched, missing };
}

function extractAllText(resume: ResumeContent): string {
  const parts: string[] = [
    resume.summary,
    ...resume.experience.flatMap((e) => [e.title, e.company, ...e.bullets, ...e.technologies]),
    ...resume.education.flatMap((e) => [e.degree, e.field, e.institution, ...e.highlights]),
    ...resume.skills.flatMap((c) => [c.category, ...c.skills]),
    ...resume.projects.flatMap((p) => [p.name, p.description, ...p.bullets, ...p.technologies]),
    ...resume.certifications.map((c) => `${c.name} ${c.issuer}`),
  ];
  return parts.filter(Boolean).join(" ");
}

function extractAllSkills(resume: ResumeContent): string[] {
  return [
    ...resume.skills.flatMap((c) => c.skills),
    ...resume.experience.flatMap((e) => e.technologies),
    ...resume.projects.flatMap((p) => p.technologies),
  ];
}

function calculateFormatScore(resume: ResumeContent): number {
  let score = 100;

  // Penalize for missing email
  if (!resume.personal.email) score -= 15;
  // Penalize for missing phone
  if (!resume.personal.phone) score -= 10;
  // Penalize for no summary
  if (!resume.summary) score -= 10;
  // Penalize for very short summary
  if (resume.summary && resume.summary.length < 50) score -= 5;
  // Penalize if no skills section
  if (resume.skills.length === 0) score -= 15;
  // Bonus for having LinkedIn
  if (resume.personal.linkedIn) score += 5;

  return Math.min(100, Math.max(0, score));
}

function calculateExperienceRelevance(resume: ResumeContent, jd: JDKeywordAnalysis): number {
  if (resume.experience.length === 0) return 20;

  const allBullets = resume.experience.flatMap((e) => e.bullets).join(" ").toLowerCase();
  const allTech = resume.experience.flatMap((e) => e.technologies).map((t) => t.toLowerCase());
  const jdKeywords = [...jd.requiredSkills, ...jd.keywords].map((k) => k.toLowerCase());

  let matchCount = 0;
  for (const kw of jdKeywords) {
    if (allBullets.includes(kw) || allTech.includes(kw)) matchCount++;
  }

  const matchRate = jdKeywords.length > 0 ? matchCount / jdKeywords.length : 0;

  // Also check experience level match
  const totalYears = resume.experience.reduce((sum, e) => {
    const start = new Date(e.startDate);
    const end = e.endDate ? new Date(e.endDate) : new Date();
    return sum + Math.max(0, (end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000));
  }, 0);

  let levelBonus = 0;
  if (jd.experienceLevel === "entry" && totalYears <= 3) levelBonus = 10;
  else if (jd.experienceLevel === "mid" && totalYears >= 2 && totalYears <= 7) levelBonus = 10;
  else if (jd.experienceLevel === "senior" && totalYears >= 5) levelBonus = 10;
  else if (jd.experienceLevel === "lead" && totalYears >= 7) levelBonus = 10;

  return Math.min(100, Math.round(matchRate * 80 + levelBonus + 10));
}

function calculateEducationAlignment(resume: ResumeContent, jd: JDKeywordAnalysis): number {
  if (jd.educationRequirement === "Any" || !jd.educationRequirement) return 90;
  if (resume.education.length === 0) return 30;

  const degrees = resume.education.map((e) => e.degree.toLowerCase());
  const req = jd.educationRequirement.toLowerCase();

  if (req.includes("phd") && degrees.some((d) => d.includes("phd") || d.includes("doctor"))) return 100;
  if (req.includes("master") && degrees.some((d) => d.includes("master") || d.includes("ms") || d.includes("mba"))) return 100;
  if (req.includes("bachelor") && degrees.some((d) => d.includes("bachelor") || d.includes("bs") || d.includes("ba"))) return 100;

  // Partial match: higher degree than required
  if (req.includes("bachelor") && degrees.some((d) => d.includes("master") || d.includes("phd"))) return 100;
  if (req.includes("master") && degrees.some((d) => d.includes("phd"))) return 100;

  return 50;
}

function calculateSectionCompleteness(resume: ResumeContent): number {
  let score = 0;
  const sections = [
    { present: !!resume.personal.fullName, weight: 15 },
    { present: !!resume.personal.email, weight: 10 },
    { present: !!resume.summary, weight: 15 },
    { present: resume.experience.length > 0, weight: 25 },
    { present: resume.education.length > 0, weight: 15 },
    { present: resume.skills.length > 0, weight: 15 },
    { present: resume.projects.length > 0, weight: 5 },
  ];

  for (const s of sections) {
    if (s.present) score += s.weight;
  }
  return score;
}

function calculateBulletQuality(resume: ResumeContent): number {
  const bullets = resume.experience.flatMap((e) => e.bullets);
  if (bullets.length === 0) return 30;

  let qualityScore = 0;
  const actionVerbs = ["led", "developed", "implemented", "designed", "managed", "created", "built", "improved", "reduced", "increased", "achieved", "delivered", "launched", "optimized", "streamlined", "analyzed", "collaborated", "mentored", "architected", "spearheaded"];

  for (const b of bullets) {
    let bulletScore = 0;
    // Starts with action verb
    if (actionVerbs.some((v) => b.toLowerCase().startsWith(v))) bulletScore += 30;
    // Contains numbers/metrics
    if (/\d+%?/.test(b)) bulletScore += 30;
    // Reasonable length (50-200 chars)
    if (b.length >= 50 && b.length <= 200) bulletScore += 20;
    // Contains impact words
    if (/result|impact|achiev|improv|increas|reduc|sav/i.test(b)) bulletScore += 20;

    qualityScore += bulletScore;
  }

  return Math.min(100, Math.round(qualityScore / bullets.length));
}

function generateSuggestions(
  resume: ResumeContent,
  jd: JDKeywordAnalysis,
  breakdown: ATSBreakdown,
  missingRequired: string[]
): ATSSuggestion[] {
  const suggestions: ATSSuggestion[] = [];

  // Missing required skills
  if (missingRequired.length > 0) {
    suggestions.push({
      section: "Skills",
      priority: "high",
      suggestion: `Add these missing required skills: ${missingRequired.slice(0, 5).join(", ")}`,
      impact: `Could improve keyword match by ${Math.round((missingRequired.length / Math.max(1, missingRequired.length + 5)) * 20)}+ points`,
    });
  }

  // No summary
  if (!resume.summary) {
    suggestions.push({
      section: "Summary",
      priority: "high",
      suggestion: "Add a professional summary highlighting your fit for this role",
      impact: "Improves format score and first impression",
    });
  }

  // Weak bullets
  if (breakdown.bulletQuality < 60) {
    suggestions.push({
      section: "Experience",
      priority: "medium",
      suggestion: "Strengthen bullet points: start with action verbs and include quantifiable metrics",
      impact: "Better demonstrates impact and improves ATS parsing",
    });
  }

  // Missing section
  if (breakdown.sectionCompleteness < 80) {
    suggestions.push({
      section: "General",
      priority: "medium",
      suggestion: "Ensure all major sections are complete: Summary, Experience, Education, Skills",
      impact: "Incomplete resumes score lower in ATS systems",
    });
  }

  // Education mismatch
  if (breakdown.educationAlignment < 70) {
    suggestions.push({
      section: "Education",
      priority: "low",
      suggestion: "Consider highlighting relevant coursework or certifications that align with job requirements",
      impact: "Strengthens education alignment score",
    });
  }

  return suggestions.sort((a, b) => {
    const priority = { high: 0, medium: 1, low: 2 };
    return priority[a.priority] - priority[b.priority];
  });
}
