import type { ResumeContent, JDKeywordAnalysis, ATSScore, ATSBreakdown, ATSSuggestion } from "../types";

// ─── Stemming & NLP Utilities ──────────────────────────────────────────────

// Common word endings for basic stemming
const SUFFIX_RULES: Array<[RegExp, string]> = [
  [/ying$/i, "y"],
  [/ies$/i, "y"],
  [/ied$/i, "y"],
  [/ement$/i, ""],
  [/ment$/i, ""],
  [/ness$/i, ""],
  [/tion$/i, ""],
  [/sion$/i, ""],
  [/able$/i, ""],
  [/ible$/i, ""],
  [/ful$/i, ""],
  [/less$/i, ""],
  [/ing$/i, ""],
  [/ings$/i, ""],
  [/ed$/i, ""],
  [/er$/i, ""],
  [/ers$/i, ""],
  [/est$/i, ""],
  [/ly$/i, ""],
  [/es$/i, ""],
  [/s$/i, ""],
];

function stem(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length <= 3) return lower;

  for (const [pattern, replacement] of SUFFIX_RULES) {
    if (pattern.test(lower)) {
      const stemmed = lower.replace(pattern, replacement);
      if (stemmed.length >= 3) return stemmed;
    }
  }
  return lower;
}

// Common acronym/synonym expansions for tech & business terms
const SYNONYMS: Record<string, string[]> = {
  "ml": ["machine learning", "ml"],
  "machine learning": ["ml", "machine learning"],
  "ai": ["artificial intelligence", "ai"],
  "artificial intelligence": ["ai", "artificial intelligence"],
  "js": ["javascript", "js"],
  "javascript": ["js", "javascript"],
  "ts": ["typescript", "ts"],
  "typescript": ["ts", "typescript"],
  "k8s": ["kubernetes", "k8s"],
  "kubernetes": ["k8s", "kubernetes"],
  "ci/cd": ["continuous integration", "continuous delivery", "ci/cd", "cicd"],
  "aws": ["amazon web services", "aws"],
  "gcp": ["google cloud platform", "google cloud", "gcp"],
  "react.js": ["react", "reactjs", "react.js"],
  "react": ["react.js", "reactjs", "react"],
  "node.js": ["node", "nodejs", "node.js"],
  "node": ["node.js", "nodejs", "node"],
  "vue.js": ["vue", "vuejs", "vue.js"],
  "next.js": ["next", "nextjs", "next.js"],
  "db": ["database", "db"],
  "sql": ["sql", "structured query language"],
  "nosql": ["nosql", "non-relational database", "no-sql"],
  "api": ["api", "application programming interface"],
  "rest": ["rest", "restful", "rest api"],
  "ui": ["user interface", "ui"],
  "ux": ["user experience", "ux"],
  "pm": ["project manager", "product manager", "pm"],
  "qa": ["quality assurance", "qa", "testing"],
  "devops": ["devops", "dev ops", "developer operations"],
  "oop": ["object oriented programming", "oop", "object-oriented"],
  "tdd": ["test driven development", "tdd"],
  "agile": ["agile", "scrum", "kanban"],
  "c#": ["csharp", "c#", "c sharp"],
  "c++": ["cpp", "c++", "c plus plus"],
  ".net": ["dotnet", ".net", "dot net"],
};

/**
 * Tokenize text into individual words/terms, preserving multi-word tech terms.
 */
function tokenize(text: string): string[] {
  // First, extract known multi-word terms (e.g., "machine learning", "node.js")
  const lowerText = text.toLowerCase();
  const tokens = new Set<string>();

  // Extract words
  const wordRegex = /[a-z0-9#+./-]+/gi;
  let match;
  while ((match = wordRegex.exec(lowerText)) !== null) {
    const word = match[0];
    if (word.length >= 2) {
      tokens.add(word);
    }
  }

  return Array.from(tokens);
}

/**
 * Check if a keyword matches within text using word-boundary matching.
 * Handles multi-word phrases and prevents "Java" matching "JavaScript".
 */
function keywordMatches(resumeTokens: Set<string>, resumeStemmedTokens: Set<string>, resumeFullText: string, keyword: string): boolean {
  const kwLower = keyword.toLowerCase().trim();

  // 1. Exact token match (word boundary safe)
  if (resumeTokens.has(kwLower)) return true;

  // 2. Multi-word keyword: check if phrase exists with word boundaries
  if (kwLower.includes(" ")) {
    const regex = new RegExp(`\\b${escapeRegex(kwLower)}\\b`, "i");
    if (regex.test(resumeFullText)) return true;
  }

  // 3. Stemmed match (e.g., "developing" matches "development")
  const kwStemmed = stem(kwLower);
  if (resumeStemmedTokens.has(kwStemmed)) return true;

  // 4. Synonym/acronym match
  const synonyms = SYNONYMS[kwLower];
  if (synonyms) {
    for (const syn of synonyms) {
      if (resumeTokens.has(syn)) return true;
      const synRegex = new RegExp(`\\b${escapeRegex(syn)}\\b`, "i");
      if (synRegex.test(resumeFullText)) return true;
    }
  }

  // 5. Single token word-boundary match (prevents "Go" matching "Google", "Java" matching "JavaScript")
  if (!kwLower.includes(" ") && kwLower.length >= 2) {
    const regex = new RegExp(`\\b${escapeRegex(kwLower)}\\b`, "i");
    if (regex.test(resumeFullText)) return true;
  }

  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Main ATS Scoring ──────────────────────────────────────────────────────

/**
 * Calculate ATS compatibility score between a resume and job description keywords.
 * Uses tokenized matching with stemming, synonym expansion, and word-boundary safety.
 */
export function calculateATSScore(resume: ResumeContent, jdAnalysis: JDKeywordAnalysis): ATSScore {
  const resumeFullText = extractAllText(resume).toLowerCase();
  const resumeTokens = new Set(tokenize(resumeFullText));
  const resumeStemmedTokens = new Set(Array.from(resumeTokens).map(stem));
  const resumeSkillTokens = new Set(extractAllSkills(resume).map((s) => s.toLowerCase()));

  // Merge resume tokens with skill tokens
  for (const s of resumeSkillTokens) {
    resumeTokens.add(s);
    resumeStemmedTokens.add(stem(s));
  }

  // 1. Keyword Match (40% weight)
  const { matched: matchedRequired, missing: missingRequired } = matchKeywords(resumeTokens, resumeStemmedTokens, resumeFullText, jdAnalysis.requiredSkills);
  const { matched: matchedPreferred } = matchKeywords(resumeTokens, resumeStemmedTokens, resumeFullText, jdAnalysis.preferredSkills);
  const { matched: matchedGeneral } = matchKeywords(resumeTokens, resumeStemmedTokens, resumeFullText, jdAnalysis.keywords);

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

/**
 * Calculate general ATS quality score for a resume when no target Job Description is provided.
 * Evaluates formatting (20%), section completeness (20%), bullet quality (35%), 
 * skill count & organization (15%), and education details (10%).
 */
export function calculateStandaloneATSScore(resume: ResumeContent): ATSScore {
  const formatScore = calculateFormatScore(resume);
  const sectionCompleteness = calculateSectionCompleteness(resume);
  const bulletQuality = calculateBulletQuality(resume);
  
  const allSkills = extractAllSkills(resume);
  const skillScore = Math.min(100, Math.round((allSkills.length / 10) * 100));
  const educationAlignment = resume.education.length > 0 ? 100 : 30;

  const totalYears = resume.experience.reduce((sum, e) => {
    const start = new Date(e.startDate || Date.now());
    const end = e.endDate ? new Date(e.endDate) : new Date();
    return sum + Math.max(0, (end.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000));
  }, 0);
  const experienceRelevance = Math.min(100, Math.round(resume.experience.length * 20 + Math.min(40, totalYears * 10)));
  const keywordMatch = skillScore;

  const overallScore = Math.round(
    formatScore * 0.20 +
    sectionCompleteness * 0.20 +
    bulletQuality * 0.35 +
    skillScore * 0.15 +
    educationAlignment * 0.10
  );

  const breakdown: ATSBreakdown = {
    keywordMatch,
    formatScore,
    experienceRelevance,
    educationAlignment,
    sectionCompleteness,
    bulletQuality,
  };

  const suggestions: ATSSuggestion[] = [];
  if (!resume.summary) {
    suggestions.push({
      section: "Summary",
      priority: "high",
      suggestion: "Add a compelling professional summary highlighting your key background and target career direction",
      impact: "Boosts first-impression ATS parsing score",
    });
  }
  if (bulletQuality < 60) {
    suggestions.push({
      section: "Experience",
      priority: "high",
      suggestion: "Start experience bullets with strong action verbs (e.g., Developed, Spearheaded) and add quantifiable metrics (e.g., %, $, numbers)",
      impact: "Significantly enhances bullet quality score and ATS ranking",
    });
  }
  if (!resume.personal.linkedIn) {
    suggestions.push({
      section: "Personal Details",
      priority: "medium",
      suggestion: "Add a customized LinkedIn profile URL to your contact header",
      impact: "Improves format & contact completeness score",
    });
  }
  if (allSkills.length < 8) {
    suggestions.push({
      section: "Skills",
      priority: "medium",
      suggestion: "List more core technical tools, frameworks, and domain competencies in your skills section",
      impact: "Enhances skill indexing by automated ATS software",
    });
  }

  return {
    overallScore: Math.min(100, Math.max(0, overallScore)),
    breakdown,
    suggestions,
    matchedKeywords: allSkills.slice(0, 15),
    missingKeywords: [],
  };
}

function matchKeywords(
  resumeTokens: Set<string>,
  resumeStemmedTokens: Set<string>,
  resumeFullText: string,
  keywords: string[]
): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];

  for (const kw of keywords) {
    if (keywordMatches(resumeTokens, resumeStemmedTokens, resumeFullText, kw)) {
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
    ...resume.experience.flatMap((e) => [e.title, e.company, ...(e.bullets || []), ...(e.technologies || [])]),
    ...resume.education.flatMap((e) => [e.degree, e.field, e.institution, ...(e.highlights || [])]),
    ...resume.skills.flatMap((c) => [c.category, ...(c.skills || [])]),
    ...resume.projects.flatMap((p) => [p.name, p.description, ...(p.bullets || []), ...(p.technologies || [])]),
    ...resume.certifications.map((c) => `${c.name} ${c.issuer}`),
  ];
  return parts.filter(Boolean).join(" ");
}

function extractAllSkills(resume: ResumeContent): string[] {
  return [
    ...resume.skills.flatMap((c) => c.skills || []),
    ...resume.experience.flatMap((e) => e.technologies || []),
    ...resume.projects.flatMap((p) => p.technologies || []),
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

  const allBullets = resume.experience.flatMap((e) => e.bullets || []).join(" ").toLowerCase();
  const allTech = resume.experience.flatMap((e) => e.technologies || []).map((t) => t.toLowerCase());
  const jdKeywords = [...jd.requiredSkills, ...jd.keywords].map((k) => k.toLowerCase());

  let matchCount = 0;
  for (const kw of jdKeywords) {
    // Use word-boundary matching for experience relevance too
    const regex = new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
    if (regex.test(allBullets) || allTech.some((t) => t === kw || t.includes(kw))) matchCount++;
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
  const bullets = resume.experience.flatMap((e) => e.bullets || []);
  if (bullets.length === 0) return 30;

  let qualityScore = 0;
  const actionVerbs = ["led", "developed", "implemented", "designed", "managed", "created", "built", "improved", "reduced", "increased", "achieved", "delivered", "launched", "optimized", "streamlined", "analyzed", "collaborated", "mentored", "architected", "spearheaded"];

  for (const b of bullets) {
    let bulletScore = 0;
    const bLower = b.toLowerCase();
    // Starts with action verb
    if (actionVerbs.some((v) => bLower.startsWith(v))) bulletScore += 30;
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
