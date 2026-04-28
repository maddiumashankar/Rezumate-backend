"""
MCP Server: Keyword Matcher
────────────────────────────
Matches resume content against job descriptions using semantic similarity.
Uses sentence-transformers for local embeddings — NO API calls, NO LLM.
"""

import json
import numpy as np
from pathlib import Path
from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("keyword-matcher")

# ── Lazy-load embedding model (loads once on first use) ──
_model = None


def get_model():
    """Lazy-load sentence-transformers model."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        # all-MiniLM-L6-v2: 80MB, fast, runs on CPU, great for semantic similarity
        _model = SentenceTransformer('all-MiniLM-L6-v2')
    return _model


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Compute cosine similarity between two vectors."""
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))


def semantic_match_skills(resume_skills: list, jd_requirements: list, threshold: float = 0.55) -> dict:
    """
    Match resume skills to JD requirements using semantic embeddings.
    This catches matches like "React.js" ↔ "React framework" that TF-IDF misses.
    """
    if not resume_skills or not jd_requirements:
        return {"matches": [], "gaps": jd_requirements, "match_rate": 0}

    model = get_model()

    # Encode all at once (batched = fast)
    resume_embeddings = model.encode(resume_skills, convert_to_numpy=True)
    jd_embeddings = model.encode(jd_requirements, convert_to_numpy=True)

    matches = []
    gaps = []

    for i, jd_req in enumerate(jd_requirements):
        best_score = 0
        best_match = ""

        for j, resume_skill in enumerate(resume_skills):
            score = cosine_similarity(resume_embeddings[j], jd_embeddings[i])
            if score > best_score:
                best_score = score
                best_match = resume_skill

        if best_score >= threshold:
            matches.append({
                "jd_requirement": jd_req,
                "resume_skill": best_match,
                "confidence": round(best_score, 3),
            })
        else:
            gaps.append({
                "jd_requirement": jd_req,
                "closest_skill": best_match,
                "confidence": round(best_score, 3),
            })

    match_rate = round(len(matches) / len(jd_requirements) * 100) if jd_requirements else 0

    return {
        "matches": sorted(matches, key=lambda x: x["confidence"], reverse=True),
        "gaps": sorted(gaps, key=lambda x: x["confidence"], reverse=True),
        "match_rate": match_rate,
        "total_jd_requirements": len(jd_requirements),
        "matched_count": len(matches),
    }


def match_experience_to_jd(experience_bullets: list, jd_text: str, threshold: float = 0.45) -> dict:
    """
    Score how relevant each experience bullet is to the JD.
    Helps identify which bullets to keep, rewrite, or remove.
    """
    if not experience_bullets:
        return {"bullet_scores": [], "average_relevance": 0}

    model = get_model()

    jd_embedding = model.encode([jd_text], convert_to_numpy=True)[0]
    bullet_embeddings = model.encode(experience_bullets, convert_to_numpy=True)

    bullet_scores = []
    for i, bullet in enumerate(experience_bullets):
        score = cosine_similarity(bullet_embeddings[i], jd_embedding)
        bullet_scores.append({
            "bullet": bullet,
            "relevance": round(score, 3),
            "action": "keep" if score >= 0.5 else ("rewrite" if score >= threshold else "consider removing"),
        })

    bullet_scores.sort(key=lambda x: x["relevance"], reverse=True)
    avg = round(sum(b["relevance"] for b in bullet_scores) / len(bullet_scores), 3) if bullet_scores else 0

    return {
        "bullet_scores": bullet_scores,
        "average_relevance": avg,
        "strong_bullets": len([b for b in bullet_scores if b["relevance"] >= 0.5]),
        "weak_bullets": len([b for b in bullet_scores if b["relevance"] < threshold]),
    }


def find_similar_from_knowledge_base(query: str, knowledge_items: list, top_k: int = 5) -> list:
    """
    Find similar items from knowledge base (power verbs, templates, etc.)
    This is a mini-RAG without needing ChromaDB for small datasets.
    """
    if not knowledge_items:
        return []

    model = get_model()
    query_embedding = model.encode([query], convert_to_numpy=True)[0]
    item_embeddings = model.encode(knowledge_items, convert_to_numpy=True)

    scores = []
    for i, item in enumerate(knowledge_items):
        score = cosine_similarity(query_embedding, item_embeddings[i])
        scores.append((item, round(score, 3)))

    scores.sort(key=lambda x: x[1], reverse=True)
    return [{"item": item, "score": score} for item, score in scores[:top_k]]


# ── MCP Tool Definitions ──

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="match_skills",
            description="Semantically match resume skills against JD requirements. Catches synonyms and related terms.",
            inputSchema={
                "type": "object",
                "properties": {
                    "resume_skills": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of skills from the resume"
                    },
                    "jd_requirements": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of requirements/skills from the job description"
                    },
                    "threshold": {
                        "type": "number",
                        "description": "Minimum similarity threshold (0-1)",
                        "default": 0.55
                    }
                },
                "required": ["resume_skills", "jd_requirements"]
            }
        ),
        Tool(
            name="score_bullets",
            description="Score each experience bullet's relevance to the JD. Identifies which to keep, rewrite, or remove.",
            inputSchema={
                "type": "object",
                "properties": {
                    "bullets": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of experience bullet points"
                    },
                    "job_description": {
                        "type": "string",
                        "description": "Full JD text"
                    }
                },
                "required": ["bullets", "job_description"]
            }
        ),
        Tool(
            name="find_similar",
            description="Find similar items from a knowledge base list (mini-RAG).",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "knowledge_items": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "top_k": {"type": "integer", "default": 5}
                },
                "required": ["query", "knowledge_items"]
            }
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "match_skills":
        result = semantic_match_skills(
            arguments["resume_skills"],
            arguments["jd_requirements"],
            arguments.get("threshold", 0.55)
        )
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    if name == "score_bullets":
        result = match_experience_to_jd(
            arguments["bullets"],
            arguments["job_description"]
        )
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    if name == "find_similar":
        result = find_similar_from_knowledge_base(
            arguments["query"],
            arguments["knowledge_items"],
            arguments.get("top_k", 5)
        )
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]


if __name__ == "__main__":
    import asyncio
    from mcp.server.stdio import stdio_server

    async def main():
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream)

    asyncio.run(main())
