"""
MCP Server: Resume Parser
─────────────────────────
Extracts structured data from PDF/DOCX resumes using rule-based parsing.
NO LLM needed — uses regex, pattern matching, and PyMuPDF.
"""

import re
import json
import fitz  # PyMuPDF
from pathlib import Path
from mcp.server import Server
from mcp.types import Tool, TextContent

server = Server("resume-parser")

# ── Regex Patterns ──
EMAIL_PATTERN = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
PHONE_PATTERN = re.compile(r'[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]{7,15}')
LINKEDIN_PATTERN = re.compile(r'linkedin\.com/in/[\w-]+', re.IGNORECASE)
URL_PATTERN = re.compile(r'https?://[^\s<>"{}|\\^`\[\]]+')

SECTION_HEADERS = {
    "experience": re.compile(
        r'^(work\s+experience|experience|employment|professional\s+experience|work\s+history)',
        re.IGNORECASE | re.MULTILINE
    ),
    "education": re.compile(
        r'^(education|academic|qualifications|degrees)',
        re.IGNORECASE | re.MULTILINE
    ),
    "skills": re.compile(
        r'^(skills|technical\s+skills|core\s+competencies|technologies|proficiencies)',
        re.IGNORECASE | re.MULTILINE
    ),
    "summary": re.compile(
        r'^(summary|professional\s+summary|objective|profile|about)',
        re.IGNORECASE | re.MULTILINE
    ),
    "certifications": re.compile(
        r'^(certifications?|licenses?|credentials)',
        re.IGNORECASE | re.MULTILINE
    ),
    "projects": re.compile(
        r'^(projects|personal\s+projects|key\s+projects)',
        re.IGNORECASE | re.MULTILINE
    ),
}

DATE_PATTERN = re.compile(
    r'((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{4}|'
    r'\d{1,2}/\d{4}|\d{4})\s*[-–—to]+\s*'
    r'((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{4}|'
    r'\d{1,2}/\d{4}|\d{4}|[Pp]resent|[Cc]urrent)',
    re.IGNORECASE
)


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract raw text from PDF using PyMuPDF."""
    doc = fitz.open(pdf_path)
    text = ""
    for page in doc:
        text += page.get_text("text") + "\n"
    doc.close()
    return text.strip()


def extract_text_from_docx(docx_path: str) -> str:
    """Extract raw text from DOCX using python-docx."""
    from docx import Document
    doc = Document(docx_path)
    return "\n".join([para.text for para in doc.paragraphs if para.text.strip()])


def extract_contact_info(text: str) -> dict:
    """Extract name, email, phone, LinkedIn from resume text."""
    lines = text.strip().split("\n")

    # Name is typically the first non-empty line
    name = ""
    for line in lines[:5]:
        cleaned = line.strip()
        if cleaned and not EMAIL_PATTERN.search(cleaned) and not PHONE_PATTERN.search(cleaned):
            if len(cleaned) < 60 and not any(c.isdigit() for c in cleaned[:3]):
                name = cleaned
                break

    emails = EMAIL_PATTERN.findall(text)
    phones = PHONE_PATTERN.findall(text)
    linkedin = LINKEDIN_PATTERN.findall(text)

    return {
        "name": name,
        "email": emails[0] if emails else "",
        "phone": phones[0] if phones else "",
        "linkedin": linkedin[0] if linkedin else "",
        "urls": URL_PATTERN.findall(text),
    }


def extract_sections(text: str) -> dict:
    """Split resume text into sections based on header patterns."""
    sections = {}
    section_positions = []

    for section_name, pattern in SECTION_HEADERS.items():
        for match in pattern.finditer(text):
            section_positions.append((match.start(), section_name, match.end()))

    # Sort by position in document
    section_positions.sort(key=lambda x: x[0])

    for i, (start, name, content_start) in enumerate(section_positions):
        end = section_positions[i + 1][0] if i + 1 < len(section_positions) else len(text)
        sections[name] = text[content_start:end].strip()

    return sections


def extract_skills(skills_text: str) -> list:
    """Parse skills from skills section — handles comma, pipe, bullet formats."""
    if not skills_text:
        return []

    # Remove common delimiters and split
    skills_text = re.sub(r'[•●○■▪►→\-\|]', ',', skills_text)
    skills_text = re.sub(r'\n+', ',', skills_text)

    skills = []
    for skill in skills_text.split(','):
        cleaned = skill.strip().strip('.')
        if cleaned and len(cleaned) < 50 and len(cleaned) > 1:
            skills.append(cleaned)

    return list(set(skills))


def extract_experience(experience_text: str) -> list:
    """Extract work experience entries."""
    if not experience_text:
        return []

    entries = []
    # Split by date patterns to find individual jobs
    lines = experience_text.split('\n')
    current_entry = None

    for line in lines:
        line = line.strip()
        if not line:
            continue

        date_match = DATE_PATTERN.search(line)
        if date_match:
            if current_entry:
                entries.append(current_entry)
            current_entry = {
                "title": re.sub(DATE_PATTERN, '', line).strip(' |–—-,'),
                "dates": date_match.group(0),
                "company": "",
                "bullets": [],
            }
        elif current_entry:
            if line.startswith(('•', '●', '○', '■', '-', '▪', '►', '→', '*')):
                bullet = re.sub(r'^[•●○■\-▪►→*]\s*', '', line)
                current_entry["bullets"].append(bullet)
            elif not current_entry["company"] and len(line) < 80:
                current_entry["company"] = line
            else:
                current_entry["bullets"].append(line)

    if current_entry:
        entries.append(current_entry)

    return entries


def extract_education(education_text: str) -> list:
    """Extract education entries."""
    if not education_text:
        return []

    entries = []
    lines = education_text.split('\n')

    current_entry = None
    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Look for degree indicators
        degree_keywords = ['bachelor', 'master', 'phd', 'b.s.', 'b.a.', 'm.s.', 'm.a.',
                          'mba', 'b.tech', 'm.tech', 'b.e.', 'diploma', 'associate']
        is_degree = any(kw in line.lower() for kw in degree_keywords)

        if is_degree or DATE_PATTERN.search(line):
            if current_entry:
                entries.append(current_entry)
            current_entry = {
                "degree": line,
                "institution": "",
                "dates": "",
            }
            date_match = DATE_PATTERN.search(line)
            if date_match:
                current_entry["dates"] = date_match.group(0)
                current_entry["degree"] = re.sub(DATE_PATTERN, '', line).strip(' |–—-,')
        elif current_entry and not current_entry["institution"]:
            current_entry["institution"] = line

    if current_entry:
        entries.append(current_entry)

    return entries


# ── MCP Tool Definitions ──

@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="parse_resume",
            description="Parse a resume file (PDF/DOCX) into structured data. Returns name, contact, skills, experience, education.",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the resume file (PDF or DOCX)"
                    }
                },
                "required": ["file_path"]
            }
        ),
        Tool(
            name="extract_raw_text",
            description="Extract raw text content from a resume file.",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "Path to the resume file"
                    }
                },
                "required": ["file_path"]
            }
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    file_path = arguments["file_path"]
    path = Path(file_path)

    if not path.exists():
        return [TextContent(type="text", text=json.dumps({"error": f"File not found: {file_path}"}))]

    # Extract text based on file type
    if path.suffix.lower() == '.pdf':
        text = extract_text_from_pdf(file_path)
    elif path.suffix.lower() in ('.docx', '.doc'):
        text = extract_text_from_docx(file_path)
    else:
        return [TextContent(type="text", text=json.dumps({"error": f"Unsupported format: {path.suffix}"}))]

    if name == "extract_raw_text":
        return [TextContent(type="text", text=json.dumps({"raw_text": text}))]

    if name == "parse_resume":
        contact = extract_contact_info(text)
        sections = extract_sections(text)

        result = {
            "contact": contact,
            "summary": sections.get("summary", ""),
            "skills": extract_skills(sections.get("skills", "")),
            "experience": extract_experience(sections.get("experience", "")),
            "education": extract_education(sections.get("education", "")),
            "certifications": sections.get("certifications", ""),
            "projects": sections.get("projects", ""),
            "raw_text": text,
            "word_count": len(text.split()),
            "sections_found": list(sections.keys()),
        }
        return [TextContent(type="text", text=json.dumps(result, indent=2))]

    return [TextContent(type="text", text=json.dumps({"error": f"Unknown tool: {name}"}))]


# ── Run Server ──
if __name__ == "__main__":
    import asyncio
    from mcp.server.stdio import stdio_server

    async def main():
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream)

    asyncio.run(main())
