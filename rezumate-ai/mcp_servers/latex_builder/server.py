"""
MCP Server: LaTeX Builder
─────────────────────────
Builds polished resume PDFs from structured data using LaTeX templates.
NO LLM needed — pure template engine (Jinja2 + pdflatex).
"""

import os
import json
import subprocess
import tempfile
import shutil
from pathlib import Path
from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("latex-builder")

# ── Templates Directory ──
TEMPLATE_DIR = Path(__file__).parent.parent.parent / "templates" / "latex"


def escape_latex(text: str) -> str:
    """Escape special LaTeX characters in user content."""
    if not text:
        return ""
    replacements = {
        '&': r'\&',
        '%': r'\%',
        '$': r'\$',
        '#': r'\#',
        '_': r'\_',
        '{': r'\{',
        '}': r'\}',
        '~': r'\textasciitilde{}',
        '^': r'\textasciicircum{}',
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text


def build_latex_from_data(resume_data: dict, template_name: str = "modern") -> str:
    """
    Build LaTeX source from structured resume data.
    Uses inline template generation — no Jinja2 dependency needed.
    """
    contact = resume_data.get("contact", {})
    name = escape_latex(contact.get("name", "Your Name"))
    email = escape_latex(contact.get("email", ""))
    phone = escape_latex(contact.get("phone", ""))
    linkedin = escape_latex(contact.get("linkedin", ""))
    summary = escape_latex(resume_data.get("summary", ""))
    skills = resume_data.get("skills", [])
    experience = resume_data.get("experience", [])
    education = resume_data.get("education", [])

    if template_name == "modern":
        return _template_modern(name, email, phone, linkedin, summary, skills, experience, education)
    elif template_name == "minimal":
        return _template_minimal(name, email, phone, linkedin, summary, skills, experience, education)
    elif template_name == "professional":
        return _template_professional(name, email, phone, linkedin, summary, skills, experience, education)
    else:
        return _template_modern(name, email, phone, linkedin, summary, skills, experience, education)


def _template_modern(name, email, phone, linkedin, summary, skills, experience, education) -> str:
    """Modern template — clean, ATS-friendly, single column."""

    # Build skills section
    skills_text = " \\textbullet{} ".join(escape_latex(s) for s in skills) if skills else ""

    # Build experience section
    exp_entries = []
    for job in experience:
        title = escape_latex(job.get("title", ""))
        company = escape_latex(job.get("company", ""))
        dates = escape_latex(job.get("dates", ""))
        bullets = "\n".join(
            f"    \\item {escape_latex(b)}"
            for b in job.get("bullets", [])
        )
        exp_entries.append(f"""
\\noindent\\textbf{{{title}}} \\hfill {dates} \\\\
\\textit{{{company}}}
\\begin{{itemize}}[nosep, leftmargin=*]
{bullets}
\\end{{itemize}}
\\vspace{{6pt}}""")

    exp_text = "\n".join(exp_entries)

    # Build education section
    edu_entries = []
    for edu in education:
        degree = escape_latex(edu.get("degree", ""))
        institution = escape_latex(edu.get("institution", ""))
        dates = escape_latex(edu.get("dates", ""))
        edu_entries.append(f"\\noindent\\textbf{{{degree}}} \\hfill {dates} \\\\\n\\textit{{{institution}}}\n\\vspace{{4pt}}")

    edu_text = "\n".join(edu_entries)

    # Contact line
    contact_parts = [p for p in [email, phone, linkedin] if p]
    contact_line = " \\quad $|$ \\quad ".join(contact_parts)

    return f"""\\documentclass[11pt, a4paper]{{article}}

% ── Packages ──
\\usepackage[top=0.6in, bottom=0.6in, left=0.7in, right=0.7in]{{geometry}}
\\usepackage{{enumitem}}
\\usepackage{{titlesec}}
\\usepackage{{hyperref}}
\\usepackage{{xcolor}}
\\usepackage{{fontenc}}

% ── Formatting ──
\\pagestyle{{empty}}
\\setlength{{\\parindent}}{{0pt}}
\\titleformat{{\\section}}{{\\large\\bfseries\\color{{black}}}}{{}}{{0em}}{{}}[\\vspace{{-6pt}}\\titlerule]
\\titlespacing*{{\\section}}{{0pt}}{{10pt}}{{6pt}}

\\begin{{document}}

% ── Header ──
\\begin{{center}}
  {{\\LARGE\\bfseries {name}}} \\\\[6pt]
  {contact_line}
\\end{{center}}

% ── Summary ──
{"\\section*{Professional Summary}" if summary else ""}
{summary}

% ── Skills ──
{"\\section*{Skills}" if skills_text else ""}
{skills_text}

% ── Experience ──
{"\\section*{Experience}" if exp_entries else ""}
{exp_text}

% ── Education ──
{"\\section*{Education}" if edu_entries else ""}
{edu_text}

\\end{{document}}
"""


def _template_minimal(name, email, phone, linkedin, summary, skills, experience, education) -> str:
    """Minimal template — maximum whitespace, ultra-clean."""
    # Simplified version for brevity
    return _template_modern(name, email, phone, linkedin, summary, skills, experience, education).replace(
        "\\large\\bfseries\\color{black}", "\\normalsize\\bfseries"
    )


def _template_professional(name, email, phone, linkedin, summary, skills, experience, education) -> str:
    """Professional template — traditional, suitable for senior roles."""
    return _template_modern(name, email, phone, linkedin, summary, skills, experience, education).replace(
        "11pt", "10pt"
    )


def compile_latex_to_pdf(latex_source: str, output_dir: str = None) -> str:
    """Compile LaTeX source to PDF using pdflatex."""
    if output_dir is None:
        output_dir = tempfile.mkdtemp()

    tex_path = os.path.join(output_dir, "resume.tex")
    pdf_path = os.path.join(output_dir, "resume.pdf")

    # Write .tex file
    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(latex_source)

    # Compile with pdflatex (run twice for references)
    for _ in range(2):
        result = subprocess.run(
            ["pdflatex", "-interaction=nonstopmode", "-output-directory", output_dir, tex_path],
            capture_output=True,
            text=True,
            timeout=30,
        )

    if os.path.exists(pdf_path):
        return pdf_path
    else:
        return f"ERROR: Compilation failed.\n{result.stdout}\n{result.stderr}"


# ── MCP Tool Definitions ──

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="build_resume_pdf",
            description="Build a polished resume PDF from structured data using LaTeX templates. Returns path to generated PDF.",
            inputSchema={
                "type": "object",
                "properties": {
                    "resume_data": {
                        "type": "object",
                        "description": "Structured resume data (from resume-parser or modified by agents)"
                    },
                    "template": {
                        "type": "string",
                        "enum": ["modern", "minimal", "professional"],
                        "description": "LaTeX template style to use",
                        "default": "modern"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Where to save the PDF (optional)"
                    }
                },
                "required": ["resume_data"]
            }
        ),
        Tool(
            name="generate_latex_source",
            description="Generate LaTeX source code without compiling. Useful for preview/editing.",
            inputSchema={
                "type": "object",
                "properties": {
                    "resume_data": {"type": "object"},
                    "template": {"type": "string", "default": "modern"}
                },
                "required": ["resume_data"]
            }
        ),
        Tool(
            name="list_templates",
            description="List available LaTeX resume templates.",
            inputSchema={"type": "object", "properties": {}}
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    if name == "list_templates":
        templates = [
            {"name": "modern", "description": "Clean, single-column, ATS-friendly. Best for most roles."},
            {"name": "minimal", "description": "Ultra-clean with maximum whitespace. Good for design/creative roles."},
            {"name": "professional", "description": "Traditional layout. Best for senior/executive roles."},
        ]
        return [TextContent(type="text", text=json.dumps(templates, indent=2))]

    if name == "generate_latex_source":
        source = build_latex_from_data(
            arguments["resume_data"],
            arguments.get("template", "modern")
        )
        return [TextContent(type="text", text=source)]

    if name == "build_resume_pdf":
        source = build_latex_from_data(
            arguments["resume_data"],
            arguments.get("template", "modern")
        )

        output_path = arguments.get("output_path")
        output_dir = os.path.dirname(output_path) if output_path else None

        pdf_path = compile_latex_to_pdf(source, output_dir)

        if pdf_path.startswith("ERROR"):
            return [TextContent(type="text", text=json.dumps({"error": pdf_path}))]

        # Move to desired output path if specified
        if output_path and os.path.exists(pdf_path):
            shutil.move(pdf_path, output_path)
            pdf_path = output_path

        return [TextContent(type="text", text=json.dumps({
            "pdf_path": pdf_path,
            "template_used": arguments.get("template", "modern"),
            "status": "success"
        }))]

    return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]


if __name__ == "__main__":
    import asyncio
    from mcp.server.stdio import stdio_server

    async def main():
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream)

    asyncio.run(main())
