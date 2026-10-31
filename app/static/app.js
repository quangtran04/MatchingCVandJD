const $ = (selector) => document.querySelector(selector);
const selectedFiles = { cv: null, jd: null };
const invalidKinds = new Set();
const extractedRawTexts = { cv: "", jd: "" };
const maxFileSize = 10 * 1024 * 1024;
let extractedProfiles = null;
let lastMatchReport = null;
let currentExtractionSource = "cv";

function updateCount(kind) {
  const node = $(`#${kind}-text`);
  if (!node) return;
  const countNode = $(`#${kind}-count`);
  if (!countNode) return;

  const count = node.value.length || extractedRawTexts[kind].length;
  countNode.textContent = `${count.toLocaleString("vi-VN")} ký tự`;
}

function getEffectiveText(kind) {
  const textVal = $(`#${kind}-text`)?.value.trim() || "";
  return textVal || extractedRawTexts[kind].trim();
}

function rawTextReady() {
  return (
    getEffectiveText("cv").length > 0 &&
    getEffectiveText("jd").length > 0 &&
    invalidKinds.size === 0
  );
}

function setStep(stage) {
  document.querySelectorAll("[data-step]").forEach((step) => {
    step.classList.toggle("active", Number(step.dataset.step) <= stage);
  });
  document.querySelectorAll(".track-line").forEach((line, index) => {
    line.classList.toggle("active", index + 1 < stage);
  });
}

function showStage(stage) {
  const stage1 = $("#stage-1");
  const stage2 = $("#extraction-result");
  const stage3 = $("#match-result");

  if (stage1) stage1.classList.toggle("hidden", stage !== 1);
  if (stage2) stage2.classList.toggle("hidden", stage !== 2);
  if (stage3) stage3.classList.toggle("hidden", stage !== 3);
  setStep(stage);
}

function invalidateAnalysis() {
  extractedProfiles = null;
  lastMatchReport = null;
  const matchBtn = $("#pipeline-match-button");
  if (matchBtn) {
    matchBtn.disabled = true;
    matchBtn.closest(".workflow-action")?.classList.remove("ready");
  }
}

function syncPipeline() {
  const ready = rawTextReady();
  const infoBtn = $("#info-extract-button");
  if (infoBtn) {
    infoBtn.disabled = !ready;
    const actionWrapper = infoBtn.closest(".workflow-action");
    if (actionWrapper) actionWrapper.classList.toggle("ready", ready);
  }
}

function showFileMessage(kind, message, isError = false) {
  const node = $(`#${kind}-file-name`);
  if (!node) return;
  node.textContent = message;
  node.style.color = isError ? "#c85841" : "";
}

function selectFile(kind, file) {
  if (!file) return;
  invalidateAnalysis();
  invalidKinds.delete(kind);
  extractedRawTexts[kind] = "";
  const textArea = $(`#${kind}-text`);
  if (textArea) textArea.value = "";
  selectedFiles[kind] = null;
  if (file.size > maxFileSize) {
    showFileMessage(kind, "Tệp vượt quá giới hạn 10MB", true);
    updateCount(kind);
    syncPipeline();
    return;
  }
  selectedFiles[kind] = file;
  showFileMessage(kind, `✓ Đã chọn: ${file.name}`);
  updateCount(kind);
  syncPipeline();
}

function apiError(body, fallback) {
  const detail = body?.detail || {};
  const error = new Error(detail.message || body?.message || fallback);
  if (detail.code === "INVALID_DOCUMENT") error.invalidFields = detail.errors || [];
  return error;
}

// Trả true nếu lỗi là "tài liệu không hợp lệ" và đã báo cho người dùng ở đúng ô nhập.
function reportInvalidDocument(error) {
  if (!error?.invalidFields?.length) return false;
  showStage(1);
  ["cv", "jd"].forEach((kind) => {
    const item = error.invalidFields.find((e) => e.field === kind);
    if (item) {
      showFileMessage(kind, `✗ ${item.message}`, true);
    } else if (selectedFiles[kind]) {
      showFileMessage(kind, `✓ Đã chọn: ${selectedFiles[kind].name}`);
    }
  });
  const firstKind = error.invalidFields[0].field;
  $(`#${firstKind}-file-name`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}

async function validateKind(kind) {
  const text = getEffectiveText(kind);
  if (!text) return;
  const response = await fetch("/api/validate-document", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, text }),
  });
  const body = await response.json();
  if (!response.ok) throw apiError(body, "Không thể kiểm tra loại tài liệu.");
}

async function extractFile(kind, file) {
  showFileMessage(kind, `◌ Đang trích xuất văn bản: ${file.name}`);
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/extract-text", { method: "POST", body: formData });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.detail?.message || body.message || "Không thể trích xuất nội dung từ tệp.");
  }

  // Văn bản trích xuất chỉ lưu trong bộ nhớ, không đưa xuống khung textarea.
  extractedRawTexts[kind] = body.text ?? body.content ?? "";

  updateCount(kind);
  showFileMessage(
    kind,
    `✓ Đã trích xuất: ${file.name} · ${extractedRawTexts[kind].length.toLocaleString("vi-VN")} ký tự${body.method ? ` · ${body.method}` : ""}`
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    '"': "&quot;",
  })[char]);
}

function fieldCard(label, title, body, extraClass = "", badgeText = "") {
  const badge = badgeText ? `<span class="card-count-badge">${escapeHtml(badgeText)}</span>` : "";
  return `<article class="field-card${extraClass ? ` ${extraClass}` : ""}">
    <div class="field-card-header">
      <div>
        <p class="mini-label">${escapeHtml(label)}</p>
        <h3>${escapeHtml(title)}</h3>
      </div>
      ${badge}
    </div>
    <div class="field-card-body">${body}</div>
  </article>`;
}

function getInitials(name) {
  if (!name) return "CV";
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function formatEntryDetails(detailsText) {
  if (!detailsText) return "";
  let text = String(detailsText).trim();
  let techText = "";

  const techMatch = text.match(/(?:Công nghệ|Technologies|Tech stack)\s*:\s*([^]+)$/i);
  if (techMatch) {
    techText = techMatch[1].trim().replace(/\.$/, "");
    text = text.slice(0, techMatch.index).trim();
  }

  const segments = text
    .split(/(?=(?:Mô tả|Công việc thực hiện|Trách nhiệm|Chuyên ngành|Major)\s*:)/i)
    .map((seg) => seg.trim())
    .filter(Boolean);

  const paragraphsHtml = segments
    .map((seg) => {
      const gpaMatch = seg.match(/\bGPA\s*:\s*([0-9.,/\s]+)/i);
      if (gpaMatch) {
        const beforeGpa = seg.slice(0, gpaMatch.index).trim();
        const gpaVal = gpaMatch[1].trim();
        return `<div class="entry-edu-row">
          ${beforeGpa ? `<span class="entry-edu-major">${escapeHtml(beforeGpa)}</span>` : ""}
          <span class="entry-gpa-badge">GPA: ${escapeHtml(gpaVal)}</span>
        </div>`;
      }
      const labelMatch = seg.match(/^([^:]{2,28}):\s*(.+)$/);
      if (labelMatch) {
        return `<p class="field-text"><strong class="detail-label">${escapeHtml(labelMatch[1])}:</strong> ${escapeHtml(labelMatch[2])}</p>`;
      }
      return `<p class="field-text">${escapeHtml(seg)}</p>`;
    })
    .join("");

  const techChips = techText
    ? `<div class="entry-tech-row">
        <span class="entry-tech-label">Công nghệ:</span>
        <div class="entry-tech-tags">
          ${techText
            .split(/[,;|]/)
            .map((item) => item.trim())
            .filter(Boolean)
            .map((item) => `<span class="mini-tech-tag">${escapeHtml(item)}</span>`)
            .join("")}
        </div>
      </div>`
    : "";

  return `${paragraphsHtml}${techChips}`;
}

// Chia các thẻ vào hai cột sao cho chiều cao cân bằng: thẻ kế tiếp luôn vào cột đang ngắn hơn.
// Cần gọi khi vùng chứa đang hiển thị để đo được chiều cao thật.
function balanceColumns(layout) {
  if (!layout) return;
  const cards = Array.from(layout.children);
  const narrow = window.matchMedia("(max-width: 960px)").matches;
  const colA = document.createElement("div");
  const colB = document.createElement("div");
  colA.className = "balanced-col";
  colB.className = "balanced-col";
  layout.replaceChildren(colA, colB);
  cards.forEach((card) => {
    if (narrow || colA.offsetHeight <= colB.offsetHeight) colA.appendChild(card);
    else colB.appendChild(card);
  });
}

function renderEntries(entries, emptyText = "Chưa tìm thấy thông tin trong hồ sơ.") {
  if (!entries?.length) {
    return `<div class="empty-state-box"><span>—</span><p class="empty-value">${escapeHtml(emptyText)}</p></div>`;
  }
  return `<div class="field-list">${entries
    .map((entry, idx) => {
      const rawTitle = String(entry.title || "").trim();
      const titleParts = rawTitle.split(/\s*\|\s*/).filter(Boolean);
      const mainTitle = titleParts[0] || rawTitle;
      const metaBadges = titleParts.slice(1);

      return `<div class="field-entry">
        <div class="field-entry-top">
          <div class="field-entry-heading">
            <span class="entry-index">${String(idx + 1).padStart(2, "0")}</span>
            <b>${escapeHtml(mainTitle)}</b>
          </div>
          ${entry.date ? `<time>${escapeHtml(entry.date)}</time>` : ""}
        </div>
        ${
          metaBadges.length
            ? `<div class="entry-meta-pills">${metaBadges
                .map((badge) => `<span class="entry-meta-pill">${escapeHtml(badge)}</span>`)
                .join("")}</div>`
            : ""
        }
        <div class="field-entry-content">
          ${formatEntryDetails(entry.details)}
        </div>
      </div>`;
    })
    .join("")}</div>`;
}

// Danh sách thu gọn: chỉ hiện tiêu đề + ngày, bấm vào để xem chi tiết.
function renderCollapsibleEntries(entries, emptyText = "Chưa tìm thấy thông tin trong hồ sơ.") {
  if (!entries?.length) {
    return `<div class="empty-state-box"><span>—</span><p class="empty-value">${escapeHtml(emptyText)}</p></div>`;
  }
  return `<div class="field-list">${entries
    .map((entry, idx) => {
      const rawTitle = String(entry.title || "").trim();
      const titleParts = rawTitle.split(/\s*\|\s*/).filter(Boolean);
      const mainTitle = titleParts[0] || rawTitle;

      return `<details class="field-entry entry-collapsible">
        <summary class="entry-summary">
          <div class="field-entry-top">
            <div class="field-entry-heading">
              <span class="entry-index">${String(idx + 1).padStart(2, "0")}</span>
              <b>${escapeHtml(mainTitle)}</b>
            </div>
            <div class="entry-summary-side">
              ${entry.date ? `<time>${escapeHtml(entry.date)}</time>` : ""}
              <span class="entry-chevron" aria-hidden="true"></span>
            </div>
          </div>
        </summary>
        <div class="field-entry-content">
          ${formatEntryDetails(entry.details)}
        </div>
      </details>`;
    })
    .join("")}</div>`;
}

function renderList(values, tags = false, emptyText = "Chưa tìm thấy thông tin.", numbered = false) {
  if (!values?.length) {
    return `<div class="empty-state-box compact"><span>—</span><p class="empty-value">${escapeHtml(emptyText)}</p></div>`;
  }
  if (tags) {
    return `<div class="tag-list">${values.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>`;
  }
  return `<div class="field-list compact-list">${values
    .map(
      (value, idx) =>
        `<div class="field-bullet-item">
          <span class="bullet-dot">${numbered ? String(idx + 1).padStart(2, "0") : "•"}</span>
          <p class="field-text">${escapeHtml(value)}</p>
        </div>`
    )
    .join("")}</div>`;
}

function renderProfile(profile) {
  const info = profile.personal_info || {};
  const name = info.name || "Ứng viên";
  const headline = info.headline || "";
  const contactItems = [
    info.email ? { icon: "✉", label: "Email", value: info.email } : null,
    info.phone ? { icon: "☎", label: "Điện thoại", value: info.phone } : null,
    info.location ? { icon: "⌖", label: "Địa điểm", value: info.location } : null,
  ].filter(Boolean);

  const extraPersonal = Object.entries(info).filter(
    ([key]) => !["name", "headline", "email", "phone", "location"].includes(key)
  );
  extraPersonal.forEach(([key, value]) => {
    if (value) contactItems.push({ icon: "•", label: key.replace(/_/g, " "), value });
  });

  const candidateHero = `<article class="profile-hero-card">
    <div class="profile-hero-top">
      <div class="profile-identity">
        <div class="profile-avatar">${escapeHtml(getInitials(name))}</div>
        <div class="profile-identity-text">
          <p class="mini-label">PERSONAL INFO · THÔNG TIN ỨNG VIÊN</p>
          <div class="profile-name-row">
            <h3>${escapeHtml(name)}</h3>
            ${headline ? `<span class="profile-headline-badge">${escapeHtml(headline)}</span>` : ""}
          </div>
          ${
            contactItems.length
              ? `<div class="profile-contacts">
                  ${contactItems
                    .map(
                      (item) => `<div class="contact-pill">
                        <span class="contact-icon" aria-hidden="true">${item.icon}</span>
                        <span class="contact-label">${escapeHtml(item.label)}:</span>
                        <b>${escapeHtml(item.value)}</b>
                      </div>`
                    )
                    .join("")}
                </div>`
              : '<p class="empty-value">Chưa tìm thấy thông tin liên hệ.</p>'
          }
        </div>
      </div>
    </div>
    <div class="profile-summary-box">
      <p class="mini-label">SUMMARY · TÓM TẮT HỒ SƠ</p>
      ${
        profile.summary
          ? `<p class="profile-summary-text">${escapeHtml(profile.summary)}</p>`
          : '<p class="empty-value">Chưa có tóm tắt giới thiệu trong hồ sơ.</p>'
      }
    </div>
  </article>`;

  const skillsCount = profile.skills?.length ? `${profile.skills.length} kỹ năng` : "";
  const projectsCount = profile.projects?.length ? `${profile.projects.length} dự án` : "";
  const expCount = profile.experience?.length ? `${profile.experience.length} vị trí` : "Chưa có";
  const eduCount = profile.education?.length ? `${profile.education.length} trường` : "";

  const container = $("#extraction-fields");
  if (!container) return;

  container.innerHTML = `
    ${candidateHero}
    <div class="cv-structured-layout">
        ${fieldCard("SKILLS", "Kỹ năng chuyên môn & cá nhân", renderList(profile.skills, true), "", skillsCount)}
        ${fieldCard("EDUCATION", "Học vấn", renderEntries(profile.education), "", eduCount)}
        ${fieldCard("PROJECTS", "Dự án tiêu biểu", renderCollapsibleEntries(profile.projects), "", projectsCount)}
        ${fieldCard(
          "EXPERIENCE",
          "Kinh nghiệm làm việc",
          renderEntries(profile.experience, "Ứng viên chưa liệt kê mục Kinh nghiệm làm việc riêng (thường gặp ở hồ sơ Sinh viên / Thực tập sinh)."),
          "",
          expCount
        )}
        ${fieldCard("LANGUAGES", "Ngoại ngữ", renderList(profile.languages))}
        ${fieldCard(
          "CERTIFICATES",
          "Chứng chỉ",
          renderList(profile.certificates, false, "Không yêu cầu / Chưa cập nhật")
        )}
    </div>
  `;

  balanceColumns(container.querySelector(".cv-structured-layout"));
}

function requirementGroup(label, values, tags = false, emptyText = "Chưa đề cập") {
  return `<div class="req-group-card">
    <div class="req-group-header">
      <b>${escapeHtml(label)}</b>
      ${values?.length ? `<span class="req-group-count">${values.length}</span>` : ""}
    </div>
    ${renderList(values, tags, emptyText)}
  </div>`;
}

function renderJobProfile(profile) {
  const job = profile.job_info || {};
  const description = profile.job_description || {};
  const requirements = profile.requirements || {};

  const jobMeta = [
    { label: "Cấp bậc", value: job.level || "Chưa xác định" },
    { label: "Hình thức", value: job.employment_type || "Chưa xác định" },
    { label: "Phòng ban", value: job.department || "Chưa xác định" },
    { label: "Địa điểm", value: job.location || "Chưa xác định" },
  ];

  const jdHero = `<article class="profile-hero-card jd-hero-card">
    <div class="profile-hero-top">
      <div class="profile-identity">
        <div class="profile-avatar jd-avatar">JD</div>
        <div class="profile-identity-text">
          <p class="mini-label">JOB INFO · THÔNG TIN VỊ TRÍ TUYỂN DỤNG</p>
          <div class="profile-name-row">
            <h3>${escapeHtml(job.title || "Vị trí tuyển dụng")}</h3>
            ${job.level ? `<span class="profile-headline-badge jd-badge">${escapeHtml(job.level)}</span>` : ""}
          </div>
          <div class="jd-meta-grid">
            ${jobMeta
              .map(
                (item) => `<div class="jd-meta-item">
                  <span>${escapeHtml(item.label)}</span>
                  <b>${escapeHtml(item.value)}</b>
                </div>`
              )
              .join("")}
          </div>
        </div>
      </div>
    </div>
    <div class="profile-summary-box">
      <p class="mini-label">JOB DESCRIPTION · TỔNG QUAN VAI TRÒ</p>
      ${
        description.description
          ? `<p class="profile-summary-text">${escapeHtml(description.description)}</p>`
          : '<p class="empty-value">Chưa tìm thấy đoạn mô tả tổng quan.</p>'
      }
    </div>
  </article>`;

  const respCount = description.responsibilities?.length
    ? `${description.responsibilities.length} nhiệm vụ`
    : "";
  const prefCount = profile.preferred_requirements?.length
    ? `${profile.preferred_requirements.length} mục`
    : "";

  // Backend trả về ["Không yêu cầu"] khi JD không nêu chứng chỉ -> coi như chưa đề cập.
  const jdCertificates = (requirements.certificates || []).filter(
    (item) => !/^\s*không yêu cầu\s*\.?\s*$/i.test(String(item))
  );

  const requirementCards = `
    ${requirementGroup("Kỹ năng bắt buộc", requirements.mandatory_skills)}
    ${requirementGroup("Công nghệ & Công cụ nhận diện", requirements.technologies_tools, true)}
    ${requirementGroup("Kinh nghiệm yêu cầu", requirements.experience)}
    ${requirementGroup("Trình độ học vấn", requirements.education)}
    ${requirementGroup("Chuyên ngành liên quan", requirements.fields_of_study, true)}
    ${requirementGroup("Ngoại ngữ", requirements.languages)}
    ${requirementGroup("Chứng chỉ", jdCertificates)}
    ${requirementGroup("Yêu cầu khác", requirements.other_requirements)}
  `;

  const container = $("#extraction-fields");
  if (!container) return;

  container.innerHTML = `
    ${jdHero}
    <div class="jd-structured-layout">
        ${fieldCard(
          "RESPONSIBILITIES",
          "Nhiệm vụ & Trách nhiệm công việc",
          renderList(description.responsibilities, false, "Chưa tìm thấy danh sách nhiệm vụ.", true),
          "",
          respCount
        )}
        ${fieldCard(
          "PREFERRED REQUIREMENTS",
          "Yêu cầu ưu tiên (Điểm cộng & Tư duy)",
          renderList(profile.preferred_requirements, false, "Không nêu yêu cầu ưu tiên riêng."),
          "",
          prefCount
        )}
        ${requirementCards}
    </div>
  `;

  balanceColumns(container.querySelector(".jd-structured-layout"));
}

function formatScore(value) {
  return value == null ? "N/A" : `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function reportSource(label, value) {
  if (!value) return "";
  return `<div class='report-source'><span>${escapeHtml(label)}</span><p>${escapeHtml(value)}</p></div>`;
}

function reportColumn(title, items, tone, emptyText) {
  const rows = items
    .map(
      (item) => `<li class='report-item'>
    <span class='report-item-icon' aria-hidden='true'>${tone === "matched" ? "✓" : tone === "review" ? "?" : "!"}</span>
    <div><div class='report-item-title'>${escapeHtml(item.title)}${item.badge ? `<span class='report-badge'>${escapeHtml(item.badge)}</span>` : ""}</div>
    ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}</div>
  </li>`
    )
    .join("");
  return `<div class='report-column report-column-${tone}'>
    <div class='report-column-heading'><h5>${title}</h5><span>${items.length}</span></div>
    ${items.length ? `<ul>${rows}</ul>` : `<p class='report-empty'>${emptyText}</p>`}
  </div>`;
}

function reportSection(id, number, title, subtitle, metric, matched, missing, sources, emptyMessage) {
  const score = metric.score;
  const sourceList = sources.map((source) => reportSource(source.label, source.text)).join("");
  const weight = score == null ? "N/A" : formatScore(metric.effective_weight * 100);
  const body =
    score == null
      ? `<div class='report-unavailable'><span class='unavailable-icon'>ℹ</span><div><strong>Tiêu chí không áp dụng tính điểm (N/A)</strong><p>${escapeHtml(emptyMessage || metric.reason)}</p></div></div>`
      : `<div class='report-columns'>
        ${reportColumn("Đã đáp ứng", matched, "matched", "Chưa ghi nhận mục phù hợp.")}
        ${reportColumn("Chưa khớp / Cần bổ sung", missing, "missing", "Không có mục nào bị thiếu.")}
      </div>`;
  return `<article class='report-section' id='${id}'>
    <div class='report-section-top'>
      <span class='report-section-number'>${number}</span>
      <div class='report-section-title'><h4>${title}</h4><p>${subtitle}</p></div>
      <strong class='report-section-score ${score == null ? "is-na" : ""}'>${formatScore(score)}</strong>
    </div>
    ${body}
    <details class='report-calculation'><summary>Xem cách tính &amp; bằng chứng truy vết</summary>
      <div class='report-calculation-body'>
        <p>${escapeHtml(metric.reason)}</p>
        <p>Trọng số áp dụng: <b>${weight}</b> · Đóng góp vào điểm nền: <b>${metric.weighted_points.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} điểm</b></p>
        ${sourceList || `<p class='report-empty'>Không có văn bản nguồn cho tiêu chí này.</p>`}
      </div>
    </details>
  </article>`;
}

function reportRoleSection(metric, tasks) {
  const score = metric.score;
  const rows = tasks
    .map((task, index) => {
      const label =
        task.status === "strong"
          ? "Phù hợp rõ"
          : task.status === "partial"
            ? "Phù hợp một phần"
            : "Chưa có bằng chứng";
      const note = task.matched_skills.length
        ? `Kỹ năng liên quan: ${task.matched_skills.map((item) => `${item.jd_skill} ↔ ${item.cv_skill}`).join(", ")}`
        : task.shared_actions.length
          ? "Nội dung và hành động thực hiện có điểm tương đồng."
          : "";
      const evidence = task.cv_evidence
        ? `<p class='report-task-evidence'><b>CV · ${escapeHtml(task.cv_section)}</b> ${escapeHtml(task.cv_evidence)}</p>`
        : `<p class='report-task-evidence is-empty'>Chưa tìm thấy kinh nghiệm hoặc dự án đủ liên quan trong CV.</p>`;
      return `<li class='report-task report-task-${task.status}'>
      <div class='report-task-heading'><span class='report-task-index'>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(task.jd_text)}</p>
        <span class='report-task-status'>${label}</span><strong class='report-task-score'>${formatScore(task.score)}</strong></div>
      ${evidence}${note ? `<p class='report-task-note'>${escapeHtml(note)}</p>` : ""}
    </li>`;
    })
    .join("");
  return `<article class='report-section report-role-section' id='report-role'>
    <div class='report-section-top'><span class='report-section-number'>01</span>
      <div class='report-section-title'><h4>Mức độ khớp Mô tả công việc</h4><p>Từng nhiệm vụ trong JD được đối chiếu trực tiếp với Kinh nghiệm và Dự án của ứng viên.</p></div>
      <strong class='report-section-score ${score == null ? "is-na" : ""}'>${formatScore(score)}</strong>
    </div>
    ${score == null ? `<div class='report-unavailable'><span class='unavailable-icon'>ℹ</span><div><strong>Tiêu chí không áp dụng (N/A)</strong><p>${escapeHtml(metric.reason)}</p></div></div>` : `<ol class='report-task-list'>${rows}</ol>`}
    <details class='report-calculation'><summary>Xem cách tính &amp; bằng chứng truy vết</summary>
      <div class='report-calculation-body'><p>${escapeHtml(metric.reason)}</p>
        <p>Điểm từng nhiệm vụ = 60% kỹ năng liên quan + 30% hành động tương ứng + 10% TF-IDF cosine. Điểm mục này là trung bình cộng các nhiệm vụ.</p>
        <p>Trọng số áp dụng: <b>${score == null ? "N/A" : formatScore(metric.effective_weight * 100)}</b> · Đóng góp vào điểm nền: <b>${metric.weighted_points.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} điểm</b></p>
        ${tasks.filter((task) => task.cv_evidence).map((task) => reportSource(`JD · ${task.jd_text}`, `CV · ${task.cv_section}: ${task.cv_evidence}`)).join("")}
      </div>
    </details>
  </article>`;
}

function reportEvidenceSection(items) {
  if (!items.length) return "";
  const supported = items
    .filter((item) => item.status !== "unverified")
    .map((item) => ({
      title: item.jd_text,
      detail: `CV · ${item.cv_section}: ${item.cv_evidence.length > 180 ? `${item.cv_evidence.slice(0, 180)}…` : item.cv_evidence}`,
      badge: item.priority === "preferred" ? "Ưu tiên" : "",
    }));
  const unverified = items
    .filter((item) => item.status === "unverified")
    .map((item) => ({
      title: item.jd_text,
      detail: "CV chưa có bằng chứng định lượng rõ; nên trao đổi thêm khi phỏng vấn.",
      badge: item.priority === "preferred" ? "Ưu tiên" : "",
    }));
  return `<article class='report-section' id='report-other'>
    <div class='report-section-top'>
      <span class='report-section-number'>05</span>
      <div class='report-section-title'><h4>Tư duy &amp; Yêu cầu ưu tiên khác</h4><p>Đối chiếu động lực, phương pháp làm việc và điểm cộng với bằng chứng trong CV.</p></div>
      <strong class='report-section-score is-na is-label'>Tham khảo · Không trừ điểm</strong>
    </div>
    <div class='report-columns'>
      ${reportColumn("Có bằng chứng liên quan", supported, "matched", "Chưa tìm thấy bằng chứng liên quan.")}
      ${reportColumn("Cần xác minh khi phỏng vấn", unverified, "review", "Không có mục nào cần xác minh thêm.")}
    </div>
    <p class='report-evidence-note'>Lưu ý: Các tiêu chí thái độ / tư duy chỉ hiển thị bằng chứng tham khảo cho người phỏng vấn, không tự động cộng hay trừ điểm.</p>
    <details class='report-calculation'><summary>Xem bằng chứng đầy đủ</summary>
      <div class='report-calculation-body'>${items.filter((item) => item.status !== "unverified").map((item) => reportSource(`JD · ${item.jd_text}`, `CV · ${item.cv_section}: ${item.cv_evidence}`)).join("")}</div>
    </details>
  </article>`;
}

function renderMatch(report) {
  lastMatchReport = report;
  const scores = report.scores;
  const skillEvidence = scores.skill_match.evidence;
  const required = skillEvidence.required || [];
  const preferred = skillEvidence.preferred || [];
  const skillMatches = report.matched_skills || [];
  const missingRequired = report.missing_required_skills || [];
  const matchedNames = new Set(skillMatches.map((item) => item.jd_skill));
  const missingPreferred = preferred.filter((item) => !matchedNames.has(item.name));
  const experience = scores.experience_match.evidence;
  const education = scores.education_match.evidence;
  const projectMatches = report.project_matches || [];

  const overall = report.overall_score;
  $("#score-ring").style.setProperty("--score", `${overall ?? 0}%`);
  $("#overall-value").textContent =
    overall == null ? "N/A" : overall.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  $("#overall-unit").textContent = overall == null ? "" : "%";
  $("#overall-title").textContent = overall == null ? "Chưa đủ dữ liệu" : "Độ tương thích với JD";
  const active = ["job_fit", "skill_match", "experience_match", "education_match"].filter(
    (key) => scores[key].score != null
  ).length;
  $("#overall-summary").textContent =
    `${active}/4 tiêu chí chính có dữ liệu chấm · Điểm nền ${formatScore(report.base_score)}. Kết quả phục vụ hỗ trợ sàng lọc hồ sơ.`;

  const tasks = report.responsibility_matches || [];
  const supportedTasks = tasks.filter((task) => task.status !== "unverified").length;
  const overview = [
    {
      index: "01",
      key: "job_fit",
      id: "report-role",
      title: "Mô tả công việc",
      note: tasks.length ? `${supportedTasks}/${tasks.length} nhiệm vụ có bằng chứng` : "JD chưa nêu nhiệm vụ rõ",
    },
    {
      index: "02",
      key: "skill_match",
      id: "report-skills",
      title: "Kỹ năng chuyên môn",
      note: `${skillMatches.length}/${required.length + preferred.length} yêu cầu kỹ năng`,
    },
    {
      index: "03",
      key: "experience_match",
      id: "report-experience",
      title: "Số năm kinh nghiệm",
      note:
        experience.jd_required_years == null
          ? "JD không yêu cầu số năm"
          : `Yêu cầu ${experience.jd_required_years} năm`,
    },
    {
      index: "04",
      key: "education_match",
      id: "report-education",
      title: "Trình độ học vấn",
      note:
        education.jd_degree || (education.jd_fields || []).length
          ? "Đối chiếu học vị & ngành"
          : "JD không yêu cầu cụ thể",
    },
  ];
  $("#metric-list").innerHTML = overview
    .map(({ index, key, id, title, note }) => {
      const score = scores[key].score;
      return `<a class='report-score-card ${score == null ? "is-na" : ""}' href='#${id}'>
      <div class='score-card-top'>
        <span>${title}</span>
        <em class='score-card-num'>${index}</em>
      </div>
      <strong>${formatScore(score)}</strong>
      <small>${escapeHtml(note)}</small>
      <div class='score-card-track'><i style='--value: ${score ?? 0}%'></i></div>
    </a>`;
    })
    .join("");

  const warning = $("#report-warning");
  warning.hidden = missingRequired.length === 0;
  warning.innerHTML = missingRequired.length
    ? `<span aria-hidden='true'>!</span><p><b>Còn ${missingRequired.length} kỹ năng bắt buộc chưa tìm thấy trong CV:</b> ${escapeHtml(missingRequired.join(", "))}. Xem chi tiết bên dưới.</p><a href='#report-skills'>Xem kỹ năng →</a>`
    : "";

  const bonus = $("#project-bonus");
  bonus.hidden = projectMatches.length === 0;
  bonus.open = false;
  const earnedBonus = report.project_bonus_points || 0;
  const appliedBonus = report.project_bonus_applied_points || 0;
  const capNote =
    earnedBonus > appliedBonus
      ? ` · đạt ${earnedBonus.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} điểm nhưng tổng giới hạn 100`
      : "";
  $("#project-bonus-value").textContent =
    `+${appliedBonus.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} điểm cộng Dự án`;
  $("#project-bonus-summary").textContent =
    `${projectMatches.length} kỹ năng yêu cầu của JD xuất hiện trực tiếp trong phần Dự án thực tế của ứng viên (tối đa +10 điểm)${capNote}`;
  $("#project-bonus-evidence").innerHTML = projectMatches
    .map((item) => reportSource(`CV · ${item.jd_skill}`, item.project_evidence))
    .join("");

  const methodLabels = {
    exact: "Trùng khớp chính xác",
    taxonomy_alias: "Từ đồng nghĩa / Alias",
    tfidf_cosine: "TF-IDF Cosine",
    rapidfuzz: "RapidFuzz",
    taxonomy_semantic: "Quan hệ ngữ nghĩa (Taxonomy)",
  };
  const skillFound = skillMatches.map((item) => ({
    title: item.jd_skill,
    detail: `Khớp với CV: ${item.cv_skill} · ${methodLabels[item.match_method] || item.tier} · Độ tin cậy ${formatScore(item.confidence * 100)}`,
    badge: item.priority === "required" ? "Bắt buộc" : "Ưu tiên",
  }));
  const skillMissing = [
    ...missingRequired.map((name) => ({
      title: name,
      detail: "Chưa tìm thấy kỹ năng tương ứng trong CV.",
      badge: "Bắt buộc",
    })),
    ...missingPreferred.map((item) => ({
      title: item.name,
      detail: "Chưa tìm thấy kỹ năng ưu tiên này trong CV.",
      badge: "Ưu tiên",
    })),
  ];
  const skillSources = [
    ...skillMatches.flatMap((item) => [
      { label: `JD · ${item.jd_skill}`, text: item.jd_evidence },
      {
        label: `CV · ${item.cv_skill}`,
        text:
          item.match_method === "tfidf_cosine" || item.match_method === "rapidfuzz"
            ? `${item.cv_evidence} · cosine ${item.cosine_similarity}`
            : item.cv_evidence,
      },
    ]),
    ...[...required, ...preferred]
      .filter((item) => !matchedNames.has(item.name))
      .map((item) => ({ label: `JD · Chưa khớp (${item.name})`, text: item.evidence })),
  ];

  const expFound = [];
  const expMissing = [];
  if (scores.experience_match.score != null) {
    if (experience.cv_years > 0)
      expFound.push({
        title: `${experience.cv_years.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} năm kinh nghiệm`,
        detail: "Được ghi nhận từ phần Kinh nghiệm làm việc của CV.",
      });
    if (scores.experience_match.score < 100) {
      const gap = Math.max((experience.jd_required_years || 0) - (experience.cv_years || 0), 0);
      expMissing.push({
        title: `Còn thiếu ${gap.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} năm`,
        detail: `JD yêu cầu tối thiểu ${experience.jd_required_years} năm kinh nghiệm.`,
      });
    }
  }

  const degreeLabels = {
    student: "Sinh viên",
    bachelor: "Cử nhân / Kỹ sư / Đại học",
    master: "Thạc sĩ",
    phd: "Tiến sĩ",
  };
  const eduFound = [];
  const eduMissing = [];
  if (education.jd_degree) {
    const item = education.degree_match
      ? {
          title: `Học vị: ${degreeLabels[education.cv_degree] || education.cv_degree}`,
          detail: `Đáp ứng yêu cầu ${degreeLabels[education.jd_degree] || education.jd_degree}.`,
        }
      : {
          title: `Học vị yêu cầu: ${degreeLabels[education.jd_degree] || education.jd_degree}`,
          detail: `CV hiện tại: ${degreeLabels[education.cv_degree] || "chưa xác định"}.`,
        };
    (education.degree_match ? eduFound : eduMissing).push(item);
  }
  if ((education.jd_fields || []).length) {
    const shared = education.jd_fields.filter((field) => (education.cv_fields || []).includes(field));
    const item = education.field_match
      ? { title: `Ngành học: ${shared.join(", ")}`, detail: "Khớp với thông tin Học vấn trong CV." }
      : {
          title: `Ngành học yêu cầu: ${education.jd_fields.join(" hoặc ")}`,
          detail: `CV hiện tại: ${(education.cv_fields || []).join(", ") || "chưa xác định"}.`,
        };
    (education.field_match ? eduFound : eduMissing).push(item);
  }

  const otherItems = report.other_requirements || [];

  $("#report-sections").innerHTML = [
    reportRoleSection(scores.job_fit, tasks),
    reportSection(
      "report-skills",
      "02",
      "Kỹ năng chuyên môn & Công nghệ",
      "Đối chiếu kỹ năng bắt buộc (trọng số ×2) và kỹ năng ưu tiên (trọng số ×1) giữa JD và CV.",
      scores.skill_match,
      skillFound,
      skillMissing,
      skillSources,
      "JD không nêu danh sách kỹ năng để đối chiếu."
    ),
    reportSection(
      "report-experience",
      "03",
      "Số năm kinh nghiệm",
      "So sánh thời gian làm việc thực tế trong CV với số năm kinh nghiệm tối thiểu JD yêu cầu.",
      scores.experience_match,
      expFound,
      expMissing,
      [
        { label: "JD · Yêu cầu", text: experience.jd_text },
        ...(experience.cv_entries || []).map((text) => ({ label: "CV · Kinh nghiệm", text })),
      ],
      scores.experience_match.reason
    ),
    reportSection(
      "report-education",
      "04",
      "Trình độ Học vấn & Chuyên ngành",
      "Đối chiếu cấp bậc đào tạo và chuyên ngành học tập giữa JD và CV.",
      scores.education_match,
      eduFound,
      eduMissing,
      [
        ...(education.jd_text || []).map((text) => ({ label: "JD · Học vấn", text })),
        ...(education.cv_entries || []).map((text) => ({ label: "CV · Học vấn", text })),
      ],
      scores.education_match.reason
    ),
    reportEvidenceSection(otherItems),
  ].join("");
}

function setExtractionTab(source) {
  currentExtractionSource = source;
  document.querySelectorAll(".extraction-tab").forEach((tab) => {
    const active = tab.dataset.source === source;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  if (!extractedProfiles) return;
  if (source === "cv") renderProfile(extractedProfiles.cv_profile);
  else renderJobProfile(extractedProfiles.jd_profile);
}

["cv", "jd"].forEach((kind) => {
  const input = $(`#${kind}-file`);
  const zone = document.querySelector(`[data-drop-zone="${kind}"]`);
  const textArea = $(`#${kind}-text`);

  if (textArea) {
    textArea.addEventListener("input", () => {
      invalidKinds.delete(kind);
      invalidateAnalysis();
      updateCount(kind);
      syncPipeline();
    });
  }

  if (zone && input) {
    zone.addEventListener("click", (e) => {
      if (e.target !== input) {
        input.click();
      }
    });

    input.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    input.addEventListener("change", () => {
      if (input.files && input.files[0]) {
        selectFile(kind, input.files[0]);
      }
    });

    ["dragenter", "dragover"].forEach((event) =>
      zone.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add("dragging");
      })
    );

    ["dragleave", "drop"].forEach((event) =>
      zone.addEventListener(event, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove("dragging");
      })
    );

    zone.addEventListener("drop", (event) => {
      if (event.dataTransfer?.files?.length) {
        const droppedFile = event.dataTransfer.files[0];
        selectFile(kind, droppedFile);
      }
    });
  }
});

const extractBtn = $("#extract-button");
if (extractBtn) {
  extractBtn.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const sources = ["cv", "jd"].filter((kind) => selectedFiles[kind]);

    // Chưa có file thì chỉ cần có văn bản dán; ô nào trống thì báo ngay.
    const empty = ["cv", "jd"].filter((kind) => !selectedFiles[kind] && !getEffectiveText(kind));
    if (empty.length) {
      empty.forEach((kind) => showFileMessage(kind, "Hãy tải tệp hoặc dán nội dung trước.", true));
      if (!sources.length && empty.length === 2) {
        syncPipeline();
        return;
      }
    }

    button.classList.add("loading");
    invalidKinds.clear();
    invalidateAnalysis();

    try {
      // Bước 1: đọc văn bản từ tệp (nếu có).
      if (sources.length) {
        button.innerHTML = "<span>◌</span> Đang trích xuất văn bản…";
        await Promise.all(sources.map((kind) => extractFile(kind, selectedFiles[kind])));
      }

      // Bước 2: kiểm tra văn bản (từ tệp hoặc dán) có đúng là CV / JD không.
      button.innerHTML = "<span>◌</span> Đang kiểm tra CV / JD…";
      const kinds = ["cv", "jd"].filter((kind) => getEffectiveText(kind));
      const results = await Promise.allSettled(kinds.map((kind) => validateKind(kind)));

      const failures = [];
      results.forEach((result, index) => {
        if (result.status === "fulfilled") return;
        const kind = kinds[index];
        const reason = result.reason;
        if (reason?.invalidFields?.length) {
          invalidKinds.add(kind);
          failures.push({ kind, message: reason.invalidFields[0].message });
        } else {
          throw reason;
        }
      });

      kinds.forEach((kind) => {
        const failure = failures.find((item) => item.kind === kind);
        if (failure) {
          showFileMessage(kind, `✗ ${failure.message}`, true);
        } else if (selectedFiles[kind]) {
          const length = extractedRawTexts[kind].length.toLocaleString("vi-VN");
          showFileMessage(kind, `✓ ${selectedFiles[kind].name} · ${length} ký tự · đúng định dạng ${kind.toUpperCase()}`);
        } else {
          showFileMessage(kind, `✓ Nội dung đúng định dạng ${kind.toUpperCase()}`);
        }
      });

      if (failures.length) {
        button.innerHTML = "<span>!</span> Tài liệu không hợp lệ";
        $(`#${failures[0].kind}-file-name`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        button.innerHTML = "<span>✓</span> Đã trích xuất & kiểm tra <b>→</b>";
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Đã có lỗi xảy ra.";
      sources.forEach((kind) => showFileMessage(kind, message, true));
      button.innerHTML = "<span>!</span> Trích xuất không thành công";
    } finally {
      button.classList.remove("loading");
      syncPipeline();
    }
  });
}

const infoExtractBtn = $("#info-extract-button");
if (infoExtractBtn) {
  infoExtractBtn.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.classList.add("loading");
    button.innerHTML = "<span>◌</span> Đang trích xuất…";
    try {
      const response = await fetch("/api/extract-information", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cv_text: getEffectiveText("cv"),
          jd_text: getEffectiveText("jd"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw apiError(body, "Không thể trích xuất thông tin.");

      extractedProfiles = body;
      // Hiện bước 2 trước rồi mới vẽ thẻ, để đo chiều cao và cân bằng hai cột chính xác.
      showStage(2);
      setExtractionTab("cv");

      const matchBtn = $("#pipeline-match-button");
      if (matchBtn) {
        matchBtn.disabled = false;
        matchBtn.closest(".workflow-action")?.classList.add("ready");
      }

      button.innerHTML = "<span>✓</span> Đã trích xuất";
      $("#extraction-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (reportInvalidDocument(error)) {
        button.innerHTML = "<span>!</span> Tài liệu không hợp lệ";
      } else {
        const message = error instanceof Error ? error.message : "Đã có lỗi xảy ra.";
        button.innerHTML = "<span>!</span> Trích xuất lỗi";
        window.alert(message);
      }
    } finally {
      button.classList.remove("loading");
    }
  });
}

document.querySelectorAll(".extraction-tab").forEach((tab) => {
  tab.addEventListener("click", () => setExtractionTab(tab.dataset.source));
});

const pipelineMatchBtn = $("#pipeline-match-button");
if (pipelineMatchBtn) {
  pipelineMatchBtn.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.classList.add("loading");
    button.innerHTML = "<span>◌</span> Đang đánh giá…";
    try {
      const response = await fetch("/api/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv_text: getEffectiveText("cv"), jd_text: getEffectiveText("jd") }),
      });
      const body = await response.json();
      if (!response.ok) throw apiError(body, "Không thể đánh giá mức độ phù hợp.");
      renderMatch(body);
      showStage(3);
      button.innerHTML = "<span>✓</span> Đã đánh giá";
      $("#match-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      if (reportInvalidDocument(error)) {
        button.innerHTML = "<span>!</span> Tài liệu không hợp lệ";
      } else {
        button.innerHTML = "<span>!</span> Đánh giá lỗi";
        window.alert(error instanceof Error ? error.message : "Đã có lỗi xảy ra.");
      }
    } finally {
      button.classList.remove("loading");
    }
  });
}

$("#back-to-input")?.addEventListener("click", () => showStage(1));
$("#back-to-extraction")?.addEventListener("click", () => showStage(2));
$("#go-to-input")?.addEventListener("click", () => {
  showStage(1);
  $("#stage-1")?.scrollIntoView({ behavior: "smooth", block: "start" });
});
$("#go-to-extraction")?.addEventListener("click", () => {
  if (extractedProfiles) {
    showStage(2);
    $("#extraction-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (rawTextReady()) {
    $("#info-extract-button")?.click();
  }
});
$("#go-to-match")?.addEventListener("click", () => {
  if (lastMatchReport) {
    showStage(3);
    $("#match-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (extractedProfiles) {
    $("#pipeline-match-button")?.click();
  }
});

// Cân bằng lại hai cột khi màn hình đổi giữa bố cục 1 cột và 2 cột.
let lastNarrow = window.matchMedia("(max-width: 960px)").matches;
window.addEventListener("resize", () => {
  const narrow = window.matchMedia("(max-width: 960px)").matches;
  if (narrow === lastNarrow) return;
  lastNarrow = narrow;
  const visible = !$("#extraction-result")?.classList.contains("hidden");
  if (extractedProfiles && visible) setExtractionTab(currentExtractionSource);
});

syncPipeline();