"""
LangGraph Agentic Orchestration
────────────────────────────────
The brain of Rezumate AI. Coordinates MCP tools + lightweight LLM
in a multi-step, self-correcting workflow.

Architecture:
  Supervisor → Parser → Scorer → Matcher → [LLM Rewriter] → LaTeX Builder → QA Loop

The LLM is ONLY used in the Rewriter node. Everything else is MCP tools (rule-based).
"""

import json
import operator
from typing import TypedDict, Annotated, Literal
from langgraph.graph import StateGraph, END
from langchain_ollama import ChatOllama

# ── State Schema ──

class ResumeState(TypedDict):
    """Shared state passed between all agent nodes."""
    # Inputs
    resume_file_path: str
    job_description: str
    template: str  # "modern", "minimal", "professional"

    # Parsed data (from MCP: resume-parser)
    parsed_resume: dict
    raw_text: str

    # Scoring (from MCP: ats-scorer)
    ats_score: dict
    keyword_report: dict

    # Matching (from MCP: keyword-matcher)
    skill_matches: dict
    bullet_scores: dict

    # Rewritten content (from LLM — only place LLM is used)
    rewritten_bullets: list
    rewritten_summary: str

    # Output (from MCP: latex-builder)
    final_resume_data: dict
    pdf_path: str

    # Control flow
    iteration: int
    max_iterations: int
    quality_passed: bool
    messages: Annotated[list, operator.add]
    errors: list


# ── Import MCP Tool Functions ──
# In production, these would call MCP servers via the MCP client SDK.
# Here we import them directly for clarity.

from mcp_servers.resume_parser.server import (
    extract_text_from_pdf,
    extract_contact_info,
    extract_sections,
    extract_skills,
    extract_experience,
    extract_education,
)
from mcp_servers.ats_scorer.server import score_resume, extract_keywords_tfidf
from mcp_servers.keyword_matcher.server import (
    semantic_match_skills,
    match_experience_to_jd,
)
from mcp_servers.latex_builder.server import build_latex_from_data, compile_latex_to_pdf


# ── Agent Nodes ──

def parse_resume_node(state: ResumeState) -> dict:
    """
    Node 1: Parse resume file into structured data.
    Tool: MCP resume-parser | LLM: None
    """
    file_path = state["resume_file_path"]

    try:
        raw_text = extract_text_from_pdf(file_path)
        contact = extract_contact_info(raw_text)
        sections = extract_sections(raw_text)

        parsed = {
            "contact": contact,
            "summary": sections.get("summary", ""),
            "skills": extract_skills(sections.get("skills", "")),
            "experience": extract_experience(sections.get("experience", "")),
            "education": extract_education(sections.get("education", "")),
            "raw_text": raw_text,
            "word_count": len(raw_text.split()),
            "sections_found": list(sections.keys()),
        }

        return {
            "parsed_resume": parsed,
            "raw_text": raw_text,
            "messages": [{"node": "parser", "status": "success", "sections": list(sections.keys())}],
        }

    except Exception as e:
        return {
            "errors": [f"Parse error: {str(e)}"],
            "messages": [{"node": "parser", "status": "error", "detail": str(e)}],
        }


def score_ats_node(state: ResumeState) -> dict:
    """
    Node 2: Score resume against JD using ATS rules.
    Tool: MCP ats-scorer | LLM: None
    """
    parsed = state.get("parsed_resume", {})
    jd = state["job_description"]

    ats_result = score_resume(parsed, jd)
    jd_keywords = extract_keywords_tfidf(jd, top_n=25)

    return {
        "ats_score": ats_result,
        "keyword_report": {"jd_keywords": jd_keywords},
        "messages": [{"node": "ats_scorer", "score": ats_result["overall_score"], "grade": ats_result["grade"]}],
    }


def match_keywords_node(state: ResumeState) -> dict:
    """
    Node 3: Semantic matching — skills + bullet relevance.
    Tool: MCP keyword-matcher (sentence-transformers) | LLM: None
    """
    parsed = state.get("parsed_resume", {})
    jd = state["job_description"]
    jd_keywords = state.get("keyword_report", {}).get("jd_keywords", [])

    # Match skills semantically
    skill_matches = semantic_match_skills(
        resume_skills=parsed.get("skills", []),
        jd_requirements=jd_keywords,
    )

    # Score each bullet's relevance
    all_bullets = []
    for exp in parsed.get("experience", []):
        all_bullets.extend(exp.get("bullets", []))

    bullet_scores = match_experience_to_jd(all_bullets, jd)

    return {
        "skill_matches": skill_matches,
        "bullet_scores": bullet_scores,
        "messages": [{"node": "matcher", "match_rate": skill_matches["match_rate"]}],
    }


def rewrite_with_llm_node(state: ResumeState) -> dict:
    """
    Node 4: THE ONLY NODE THAT USES AN LLM.
    Rewrites weak bullets and generates a tailored summary.
    Uses Qwen2 1.5B or Phi-3 Mini via Ollama — ultra-lightweight.
    """
    llm = ChatOllama(
        model="qwen2:1.5b",  # Ultra-light: runs on 4GB RAM, CPU only
        base_url="http://localhost:11434",
        temperature=0.3,
    )

    parsed = state.get("parsed_resume", {})
    bullet_scores = state.get("bullet_scores", {})
    missing_keywords = state.get("ats_score", {}).get("keywords", {}).get("missing_keywords", [])
    jd = state["job_description"]

    # ── Rewrite weak bullets ──
    weak_bullets = [
        b for b in bullet_scores.get("bullet_scores", [])
        if b.get("action") in ("rewrite", "consider removing")
    ]

    rewritten = []
    for bullet_info in weak_bullets[:5]:  # Limit to 5 rewrites per iteration
        original = bullet_info["bullet"]
        keywords_to_add = missing_keywords[:3]  # Suggest up to 3 keywords per bullet

        prompt = (
            f"Rewrite this resume bullet point to be more impactful and naturally include "
            f"these keywords: {', '.join(keywords_to_add)}.\n\n"
            f"Original: {original}\n\n"
            f"Rules:\n"
            f"- Start with a strong action verb\n"
            f"- Include quantified results if possible\n"
            f"- Keep it to 1-2 lines\n"
            f"- Sound professional, not robotic\n\n"
            f"Rewritten bullet:"
        )

        response = llm.invoke(prompt)
        rewritten.append({
            "original": original,
            "rewritten": response.content.strip(),
            "keywords_added": keywords_to_add,
        })

    # ── Generate tailored summary ──
    current_summary = parsed.get("summary", "")
    skills = parsed.get("skills", [])

    summary_prompt = (
        f"Write a 2-3 sentence professional summary for a resume.\n\n"
        f"Current skills: {', '.join(skills[:10])}\n"
        f"Job description focus: {jd[:300]}\n"
        f"{'Current summary: ' + current_summary if current_summary else ''}\n\n"
        f"Write a concise, powerful summary that positions this candidate for the role. "
        f"Do not use first person. Start with the candidate's professional identity."
    )

    summary_response = llm.invoke(summary_prompt)

    return {
        "rewritten_bullets": rewritten,
        "rewritten_summary": summary_response.content.strip(),
        "messages": [{"node": "rewriter", "bullets_rewritten": len(rewritten)}],
    }


def build_latex_node(state: ResumeState) -> dict:
    """
    Node 5: Merge rewritten content into structured data → LaTeX → PDF.
    Tool: MCP latex-builder | LLM: None
    """
    parsed = state.get("parsed_resume", {}).copy()
    rewritten_bullets = state.get("rewritten_bullets", [])
    rewritten_summary = state.get("rewritten_summary", "")

    # Apply rewritten bullets
    bullet_map = {r["original"]: r["rewritten"] for r in rewritten_bullets}
    for exp in parsed.get("experience", []):
        exp["bullets"] = [
            bullet_map.get(b, b)
            for b in exp.get("bullets", [])
        ]

    # Apply rewritten summary
    if rewritten_summary:
        parsed["summary"] = rewritten_summary

    # Build LaTeX and compile
    template = state.get("template", "modern")
    latex_source = build_latex_from_data(parsed, template)
    pdf_path = compile_latex_to_pdf(latex_source)

    return {
        "final_resume_data": parsed,
        "pdf_path": pdf_path,
        "messages": [{"node": "latex_builder", "pdf": pdf_path, "template": template}],
    }


def quality_check_node(state: ResumeState) -> dict:
    """
    Node 6: Re-score the updated resume. If quality improved enough, stop. Otherwise loop.
    Tool: MCP ats-scorer | LLM: None
    """
    final_data = state.get("final_resume_data", {})
    jd = state["job_description"]
    iteration = state.get("iteration", 0) + 1
    max_iter = state.get("max_iterations", 2)

    # Re-score
    new_score = score_resume(final_data, jd)
    old_score = state.get("ats_score", {}).get("overall_score", 0)

    quality_passed = new_score["overall_score"] >= 70 or iteration >= max_iter

    return {
        "ats_score": new_score,
        "iteration": iteration,
        "quality_passed": quality_passed,
        "messages": [{
            "node": "quality_check",
            "old_score": old_score,
            "new_score": new_score["overall_score"],
            "iteration": iteration,
            "passed": quality_passed,
        }],
    }


# ── Routing ──

def should_continue(state: ResumeState) -> Literal["rewrite", "done"]:
    """Decide whether to loop back for another rewrite or finish."""
    if state.get("quality_passed", False):
        return "done"
    return "rewrite"


# ── Build the Graph ──

def build_rezumate_graph() -> StateGraph:
    """Construct the full LangGraph workflow."""

    graph = StateGraph(ResumeState)

    # Add nodes
    graph.add_node("parse_resume", parse_resume_node)
    graph.add_node("score_ats", score_ats_node)
    graph.add_node("match_keywords", match_keywords_node)
    graph.add_node("rewrite_llm", rewrite_with_llm_node)
    graph.add_node("build_latex", build_latex_node)
    graph.add_node("quality_check", quality_check_node)

    # Define edges (the flow)
    graph.set_entry_point("parse_resume")
    graph.add_edge("parse_resume", "score_ats")
    graph.add_edge("score_ats", "match_keywords")
    graph.add_edge("match_keywords", "rewrite_llm")
    graph.add_edge("rewrite_llm", "build_latex")
    graph.add_edge("build_latex", "quality_check")

    # Conditional: loop or finish
    graph.add_conditional_edges(
        "quality_check",
        should_continue,
        {
            "rewrite": "rewrite_llm",  # Loop back
            "done": END,               # Finish
        },
    )

    return graph.compile()


# ── Entry Point ──

def run_rezumate(resume_path: str, job_description: str, template: str = "modern") -> dict:
    """Run the full Rezumate AI pipeline."""
    graph = build_rezumate_graph()

    initial_state = {
        "resume_file_path": resume_path,
        "job_description": job_description,
        "template": template,
        "parsed_resume": {},
        "raw_text": "",
        "ats_score": {},
        "keyword_report": {},
        "skill_matches": {},
        "bullet_scores": {},
        "rewritten_bullets": [],
        "rewritten_summary": "",
        "final_resume_data": {},
        "pdf_path": "",
        "iteration": 0,
        "max_iterations": 2,
        "quality_passed": False,
        "messages": [],
        "errors": [],
    }

    result = graph.invoke(initial_state)

    return {
        "pdf_path": result.get("pdf_path", ""),
        "ats_score": result.get("ats_score", {}),
        "skill_matches": result.get("skill_matches", {}),
        "iterations": result.get("iteration", 0),
        "messages": result.get("messages", []),
        "rewritten_bullets": result.get("rewritten_bullets", []),
        "rewritten_summary": result.get("rewritten_summary", ""),
    }


if __name__ == "__main__":
    # Example usage
    result = run_rezumate(
        resume_path="sample_resume.pdf",
        job_description="We are looking for a Senior Python Developer with experience in FastAPI, Docker, AWS...",
        template="modern",
    )
    print(json.dumps(result, indent=2))
