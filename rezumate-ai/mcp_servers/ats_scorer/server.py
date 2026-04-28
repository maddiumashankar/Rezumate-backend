"""
MCP Server: ATS Scorer
──────────────────────
Scores resumes against job descriptions using rule-based logic.
NO LLM needed — uses TF-IDF, fuzzy matching, and scoring rules.
"""

import re
import json
import math
from collections import Counter
from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("ats-scorer")


# ── ATS Scoring Rules ──

ATS_FORMATTING_RULES = {
    "has_contact_info": {
        "weight": 10,
        "check": lambda d: bool(d.get("contact", {}).get("email")),
        "message": "Resume must include email contact"
    },
    "has_phone": {
        "weight": 5,
        "check": lambda d: bool(d.get("contact", {}).get("phone")),
        "message": "Phone number recommended"
    },
    "has_summary": {
        "weight": 10,
        "check": lambda d: len(d.get("summary", "")) > 20,
        "message": "Professional summary section recommended"
    },
    "has_experience": {
        "weight": 15,
        "check": lambda d: len(d.get("experience", [])) > 0,
        "message": "Work experience section is essential"
    },
    "has_education": {
        "weight": 10,
        "check": lambda d: len(d.get("education", [])) > 0,
        "message": "Education section is expected"
    },
    "has_skills": {
        "weight": 10,
        "check": lambda d: len(d.get("skills", [])) > 0,
        "message": "Skills section is important for ATS keyword matching"
    },
    "reasonable_length": {
        "weight": 5,
        "check": lambda d: 200 <= d.get("word_count", 0) <= 1200,
        "message": "Resume should be 200-1200 words (1-2 pages)"
    },
    "has_bullet_points": {
        "weight": 10,
        "check": lambda d: any(
            len(exp.get("bullets", [])) > 0
            for exp in d.get("experience", [])
        ),
        "message": "Use bullet points in experience section"
    },
    "quantified_achievements": {
        "weight": 10,
        "check": lambda d: _has_numbers_in_bullets(d),
        "message": "Include quantified achievements (numbers, percentages, metrics)"
    },
}


def _has_numbers_in_bullets(resume_data: dict) -> bool:
    """Check if bullets contain quantified achievements."""
    number_pattern = re.compile(r'\d+[%$KMkm]|\$\d+|\d+\+?\s*(years?|clients?|projects?|team|members?|users?)')
    for exp in resume_data.get("experience", []):
        for bullet in exp.get("bullets", []):
            if number_pattern.search(bullet):
                return True
    return False


# ── TF-IDF Keyword Extraction (No sklearn needed) ──

def tokenize(text: str) -> list:
    """Simple tokenizer — lowercase, remove punctuation, filter stopwords."""
    STOPWORDS = {
        'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'shall', 'not', 'no', 'if', 'then',
        'than', 'that', 'this', 'these', 'those', 'it', 'its', 'as', 'so',
        'such', 'very', 'too', 'also', 'just', 'about', 'above', 'after',
        'all', 'am', 'any', 'because', 'before', 'between', 'both', 'each',
        'etc', 'we', 'our', 'you', 'your', 'they', 'their', 'i', 'me', 'my',
        'he', 'she', 'him', 'her', 'who', 'which', 'what', 'when', 'where',
        'how', 'up', 'out', 'into', 'over', 'own', 'same', 'other', 'some',
        'new', 'now', 'only', 'more', 'most', 'well', 'work', 'working',
    }
    words = re.findall(r'[a-z][a-z+#.-]*[a-z]|[a-z]', text.lower())
    return [w for w in words if w not in STOPWORDS and len(w) > 1]


def extract_keywords_tfidf(text: str, top_n: int = 30) -> list:
    """Extract top keywords using simple TF scoring."""
    tokens = tokenize(text)
    freq = Counter(tokens)
    total = len(tokens) if tokens else 1

    # Score by frequency weighted by word length (longer = more specific)
    scored = []
    for word, count in freq.items():
        tf = count / total
        length_bonus = min(len(word) / 10, 0.5)
        score = tf + length_bonus
        scored.append((word, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [word for word, _ in scored[:top_n]]


def extract_ngrams(text: str, n: int = 2) -> list:
    """Extract bigrams/trigrams for multi-word skills."""
    tokens = text.lower().split()
    ngrams = []
    for i in range(len(tokens) - n + 1):
        gram = ' '.join(tokens[i:i + n])
        # Filter out grams that are mostly stopwords
        if len(gram) > 5:
            ngrams.append(gram)
    return ngrams


# ── Fuzzy Matching ──

def similarity(a: str, b: str) -> float:
    """Simple Jaccard similarity between two strings."""
    set_a = set(a.lower().split())
    set_b = set(b.lower().split())
    if not set_a or not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union)


def fuzzy_match_keywords(resume_keywords: set, jd_keywords: set, threshold: float = 0.7) -> dict:
    """Match keywords with fuzzy tolerance."""
    exact_matches = resume_keywords & jd_keywords
    fuzzy_matches = set()
    unmatched = set()

    for jd_kw in jd_keywords - exact_matches:
        best_match = None
        best_score = 0
        for r_kw in resume_keywords:
            # Check substring match
            if jd_kw in r_kw or r_kw in jd_kw:
                best_match = r_kw
                best_score = 0.9
                break
            # Check similarity
            score = similarity(jd_kw, r_kw)
            if score > best_score:
                best_score = score
                best_match = r_kw

        if best_score >= threshold:
            fuzzy_matches.add(jd_kw)
        else:
            unmatched.add(jd_kw)

    return {
        "exact_matches": list(exact_matches),
        "fuzzy_matches": list(fuzzy_matches),
        "missing_keywords": list(unmatched),
    }


# ── Core Scoring ──

def score_resume(resume_data: dict, jd_text: str) -> dict:
    """Full ATS scoring — formatting + keyword match + overall."""

    # 1. Formatting score (rule-based)
    formatting_results = {}
    formatting_score = 0
    formatting_max = 0

    for rule_name, rule in ATS_FORMATTING_RULES.items():
        passed = rule["check"](resume_data)
        formatting_results[rule_name] = {
            "passed": passed,
            "weight": rule["weight"],
            "message": rule["message"],
        }
        if passed:
            formatting_score += rule["weight"]
        formatting_max += rule["weight"]

    formatting_pct = round((formatting_score / formatting_max) * 100) if formatting_max else 0

    # 2. Keyword matching score
    jd_keywords = set(extract_keywords_tfidf(jd_text, top_n=25))
    resume_text = resume_data.get("raw_text", "")
    resume_skills = set(s.lower() for s in resume_data.get("skills", []))
    resume_keywords = set(extract_keywords_tfidf(resume_text, top_n=40))
    all_resume_keywords = resume_keywords | resume_skills

    keyword_results = fuzzy_match_keywords(all_resume_keywords, jd_keywords)

    total_jd_keywords = len(jd_keywords)
    matched_count = len(keyword_results["exact_matches"]) + len(keyword_results["fuzzy_matches"])
    keyword_pct = round((matched_count / total_jd_keywords) * 100) if total_jd_keywords else 0

    # 3. Overall score (weighted)
    overall = round(formatting_pct * 0.35 + keyword_pct * 0.65)

    # 4. Grade
    if overall >= 85:
        grade = "A"
        verdict = "Excellent match — high ATS pass probability"
    elif overall >= 70:
        grade = "B"
        verdict = "Good match — likely to pass most ATS systems"
    elif overall >= 55:
        grade = "C"
        verdict = "Fair match — some optimization needed"
    elif overall >= 40:
        grade = "D"
        verdict = "Weak match — significant gaps to address"
    else:
        grade = "F"
        verdict = "Poor match — major rewrite recommended"

    return {
        "overall_score": overall,
        "grade": grade,
        "verdict": verdict,
        "formatting": {
            "score": formatting_pct,
            "details": formatting_results,
        },
        "keywords": {
            "score": keyword_pct,
            "jd_keywords_found": total_jd_keywords,
            "matched": matched_count,
            **keyword_results,
        },
        "recommendations": _generate_recommendations(formatting_results, keyword_results, overall),
    }


def _generate_recommendations(formatting: dict, keywords: dict, score: int) -> list:
    """Generate actionable recommendations — no LLM needed."""
    recs = []

    # Formatting recommendations
    for rule_name, result in formatting.items():
        if not result["passed"]:
            recs.append({
                "type": "formatting",
                "priority": "high" if result["weight"] >= 10 else "medium",
                "action": result["message"],
            })

    # Keyword recommendations
    missing = keywords.get("missing_keywords", [])
    if missing:
        recs.append({
            "type": "keywords",
            "priority": "high",
            "action": f"Add these missing keywords to your resume: {', '.join(missing[:10])}",
        })

    if score < 70:
        recs.append({
            "type": "general",
            "priority": "high",
            "action": "Consider rewriting experience bullets to include more JD-relevant terminology",
        })

    return recs


# ── MCP Tool Definitions ──

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="score_ats",
            description="Score a parsed resume against a job description. Returns overall score, keyword matches, formatting checks, and recommendations.",
            inputSchema={
                "type": "object",
                "properties": {
                    "resume_data": {
                        "type": "object",
                        "description": "Parsed resume data from resume-parser"
                    },
                    "job_description": {
                        "type": "string",
                        "description": "Full text of the job description"
                    }
                },
                "required": ["resume_data", "job_description"]
            }
        ),
        Tool(
            name="extract_jd_keywords",
            description="Extract top keywords from a job description using TF-IDF.",
            inputSchema={
                "type": "object",
                "properties": {
                    "job_description": {
                        "type": "string",
                        "description": "Full text of the job description"
                    },
                    "top_n": {
                        "type": "integer",
                        "description": "Number of top keywords to extract",
                        "default": 25
                    }
                },
                "required": ["job_description"]
            }
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "score_ats":
        result = score_resume(arguments["resume_data"], arguments["job_description"])
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    if name == "extract_jd_keywords":
        keywords = extract_keywords_tfidf(
            arguments["job_description"],
            arguments.get("top_n", 25)
        )
        return [TextContent(type="text", text=json.dumps({"keywords": keywords}))]

    return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]


if __name__ == "__main__":
    import asyncio
    from mcp.server.stdio import stdio_server

    async def main():
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream)

    asyncio.run(main())
