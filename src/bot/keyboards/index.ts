import { Markup } from "telegraf";

export const mainMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("📄 Resume Train", "resume_train")],
    [Markup.button.callback("📋 My Resume", "my_resume")],
    [Markup.button.callback("📎 Templates", "templates")],
    [Markup.button.callback("🔍 Skills Gap Analysis", "skills_gap")],
    [Markup.button.callback("🎤 Interview Prep", "interview_prep")],
    [Markup.button.callback("✉️ Cover Letter", "cover_letter")],
    [Markup.button.callback("❓ Help", "help")],
  ]);

export const resumeUploadOptions = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("📁 Upload File (PDF/DOCX)", "upload_file")],
    [Markup.button.callback("📝 Paste Text", "paste_text")],
    [Markup.button.callback("🔙 Back to Menu", "cancel")],
  ]);

export const resumeReviewOptions = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("✅ Looks Good", "review_ok")],
    [Markup.button.callback("✏️ Edit Sections", "edit_section")],
    [Markup.button.callback("🔙 Start Over", "cancel")],
  ]);

export const editSectionMenu = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("👤 Personal Info", "edit_personal")],
    [Markup.button.callback("📝 Summary", "edit_summary")],
    [Markup.button.callback("💼 Experience", "edit_experience")],
    [Markup.button.callback("🎓 Education", "edit_education")],
    [Markup.button.callback("🛠 Skills", "edit_skills")],
    [Markup.button.callback("📁 Projects", "edit_projects")],
    [Markup.button.callback("✅ Done Editing", "review_ok")],
    [Markup.button.callback("🔙 Back", "cancel")],
  ]);

export const changeApprovalOptions = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("✅ Approve Changes", "approve_changes")],
    [Markup.button.callback("❌ Reject Changes", "reject_changes")],
    [Markup.button.callback("🔙 Cancel", "cancel")],
  ]);

export const newContentOptions = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("➕ Add New Projects/Skills", "add_new_content")],
    [Markup.button.callback("⏭ Skip & Finalize", "skip_new_content")],
    [Markup.button.callback("🔙 Cancel", "cancel")],
  ]);

export const finalReviewOptions = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("✅ Accept & Save", "accept_final")],
    [Markup.button.callback("❌ Reject & Redo", "reject_final")],
    [Markup.button.callback("🔙 Back to Menu", "cancel")],
  ]);

export const yesNoOptions = (yesAction: string, noAction: string) =>
  Markup.inlineKeyboard([
    [Markup.button.callback("✅ Yes", yesAction)],
    [Markup.button.callback("❌ No", noAction)],
  ]);

export const templateCategories = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("🟢 Entry Level", "template_entry_level")],
    [Markup.button.callback("🟡 Mid Level", "template_mid_level")],
    [Markup.button.callback("🔵 Senior", "template_senior")],
    [Markup.button.callback("🟣 Executive", "template_executive")],
    [Markup.button.callback("🔙 Back", "cancel")],
  ]);

export const confirmOptions = () =>
  Markup.inlineKeyboard([
    [Markup.button.callback("✅ Confirm", "confirm")],
    [Markup.button.callback("❌ Cancel", "cancel")],
  ]);
