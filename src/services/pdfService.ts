import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import type { ResumeContent } from "../types";
import logger from "../utils/logger";

const COLORS = {
  primary: "#1a1a2e",
  secondary: "#16213e",
  accent: "#0f3460",
  text: "#333333",
  lightText: "#666666",
  link: "#0066cc",
  divider: "#cccccc",
};

const FONTS = {
  heading: "Helvetica-Bold",
  body: "Helvetica",
  italic: "Helvetica-Oblique",
};

/**
 * Generate a professional PDF resume from structured content.
 */
export async function generateResumePDF(content: ResumeContent, outputPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 50, bottom: 50, left: 55, right: 55 },
        info: {
          Title: `${content.personal.fullName} - Resume`,
          Author: content.personal.fullName,
        },
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      let y = doc.y;

      // ---- Header / Personal Info ----
      doc.font(FONTS.heading).fontSize(22).fillColor(COLORS.primary).text(content.personal.fullName, { align: "center" });
      y = doc.y + 4;

      if (content.personal.title) {
        doc.font(FONTS.italic).fontSize(12).fillColor(COLORS.accent).text(content.personal.title, { align: "center" });
        y = doc.y + 4;
      }

      // Contact line
      const contactParts: string[] = [];
      if (content.personal.email) contactParts.push(content.personal.email);
      if (content.personal.phone) contactParts.push(content.personal.phone);
      if (content.personal.location) contactParts.push(content.personal.location);
      if (contactParts.length > 0) {
        doc.font(FONTS.body).fontSize(9).fillColor(COLORS.lightText).text(contactParts.join("  |  "), { align: "center" });
      }

      // Links line
      const linkParts: string[] = [];
      if (content.personal.linkedIn) linkParts.push(`LinkedIn: ${content.personal.linkedIn}`);
      if (content.personal.github) linkParts.push(`GitHub: ${content.personal.github}`);
      if (content.personal.portfolio) linkParts.push(`Portfolio: ${content.personal.portfolio}`);
      if (linkParts.length > 0) {
        doc.font(FONTS.body).fontSize(8).fillColor(COLORS.link).text(linkParts.join("  |  "), { align: "center" });
      }

      drawDivider(doc, doc.y + 8);

      // ---- Summary ----
      if (content.summary) {
        drawSectionHeader(doc, "PROFESSIONAL SUMMARY");
        doc.font(FONTS.body).fontSize(10).fillColor(COLORS.text).text(content.summary, { lineGap: 2 });
        doc.moveDown(0.5);
      }

      // ---- Experience ----
      if (content.experience.length > 0) {
        drawSectionHeader(doc, "EXPERIENCE");
        for (const exp of content.experience) {
          checkPageBreak(doc, 80);
          doc.font(FONTS.heading).fontSize(11).fillColor(COLORS.primary).text(exp.title);
          const dateStr = `${exp.startDate} – ${exp.isCurrent ? "Present" : exp.endDate || ""}`;
          doc.font(FONTS.italic).fontSize(10).fillColor(COLORS.accent).text(`${exp.company}${exp.location ? `, ${exp.location}` : ""}  |  ${dateStr}`);
          doc.moveDown(0.3);

          for (const bullet of (exp.bullets || [])) {
            checkPageBreak(doc, 20);
            doc.font(FONTS.body).fontSize(9.5).fillColor(COLORS.text).text(`•  ${bullet}`, { indent: 10, lineGap: 1.5 });
          }

          if (exp.technologies && exp.technologies.length > 0) {
            doc.font(FONTS.italic).fontSize(8.5).fillColor(COLORS.lightText).text(`Technologies: ${exp.technologies.join(", ")}`, { indent: 10 });
          }
          doc.moveDown(0.5);
        }
      }

      // ---- Education ----
      if (content.education.length > 0) {
        drawSectionHeader(doc, "EDUCATION");
        for (const edu of content.education) {
          checkPageBreak(doc, 40);
          doc.font(FONTS.heading).fontSize(11).fillColor(COLORS.primary).text(`${edu.degree} in ${edu.field}`);
          doc.font(FONTS.italic).fontSize(10).fillColor(COLORS.accent).text(`${edu.institution}  |  ${edu.startDate} – ${edu.endDate}`);
          if (edu.gpa) {
            doc.font(FONTS.body).fontSize(9).fillColor(COLORS.text).text(`GPA: ${edu.gpa}`);
          }
          for (const h of (edu.highlights || [])) {
            doc.font(FONTS.body).fontSize(9.5).fillColor(COLORS.text).text(`•  ${h}`, { indent: 10 });
          }
          doc.moveDown(0.4);
        }
      }

      // ---- Skills ----
      if (content.skills.length > 0) {
        drawSectionHeader(doc, "SKILLS");
        for (const cat of content.skills) {
          checkPageBreak(doc, 20);
          doc.font(FONTS.heading).fontSize(9.5).fillColor(COLORS.primary).text(`${cat.category}: `, { continued: true });
          doc.font(FONTS.body).fontSize(9.5).fillColor(COLORS.text).text(cat.skills.join(", "));
        }
        doc.moveDown(0.5);
      }

      // ---- Projects ----
      if (content.projects.length > 0) {
        drawSectionHeader(doc, "PROJECTS");
        for (const proj of content.projects) {
          checkPageBreak(doc, 50);
          doc.font(FONTS.heading).fontSize(10.5).fillColor(COLORS.primary).text(proj.name);
          if (proj.description) {
            doc.font(FONTS.body).fontSize(9.5).fillColor(COLORS.text).text(proj.description);
          }
          for (const bullet of (proj.bullets || [])) {
            doc.font(FONTS.body).fontSize(9.5).fillColor(COLORS.text).text(`•  ${bullet}`, { indent: 10 });
          }
          if (proj.technologies && proj.technologies.length > 0) {
            doc.font(FONTS.italic).fontSize(8.5).fillColor(COLORS.lightText).text(`Technologies: ${proj.technologies.join(", ")}`, { indent: 10 });
          }
          doc.moveDown(0.4);
        }
      }

      // ---- Certifications ----
      if (content.certifications.length > 0) {
        drawSectionHeader(doc, "CERTIFICATIONS");
        for (const cert of content.certifications) {
          checkPageBreak(doc, 20);
          doc.font(FONTS.body).fontSize(9.5).fillColor(COLORS.text).text(`•  ${cert.name} – ${cert.issuer} (${cert.date})`, { indent: 10 });
        }
        doc.moveDown(0.5);
      }

      // ---- Languages ----
      if (content.languages.length > 0) {
        drawSectionHeader(doc, "LANGUAGES");
        const langStr = content.languages.map((l) => `${l.language} (${l.proficiency})`).join(", ");
        doc.font(FONTS.body).fontSize(9.5).fillColor(COLORS.text).text(langStr);
      }

      doc.end();
      stream.on("finish", () => {
        logger.info(`PDF generated: ${outputPath}`);
        resolve(outputPath);
      });
      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

function drawSectionHeader(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.3);
  doc.font(FONTS.heading).fontSize(12).fillColor(COLORS.secondary).text(title);
  const lineY = doc.y + 2;
  doc.moveTo(55, lineY).lineTo(540, lineY).strokeColor(COLORS.accent).lineWidth(1).stroke();
  doc.moveDown(0.4);
}

function drawDivider(doc: PDFKit.PDFDocument, y: number): void {
  doc.moveTo(55, y).lineTo(540, y).strokeColor(COLORS.divider).lineWidth(0.5).stroke();
  doc.y = y + 8;
}

function checkPageBreak(doc: PDFKit.PDFDocument, requiredSpace: number): void {
  if (doc.y + requiredSpace > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}
