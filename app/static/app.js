const $ = (selector) => document.querySelector(selector);
const selectedFiles = { cv: null, jd: null };
const extractedRawTexts = { cv: "", jd: "" };
const maxFileSize = 10 * 1024 * 1024;
let extractedProfiles = null;
let lastMatchReport = null;

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
  return getEffectiveText("cv").length > 0 && getEffectiveText("jd").length > 0;
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

async function extractFile(kind, file) {
  showFileMessage(kind, `◌ Đang trích xuất văn bản: ${file.name}`);
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/extract-text", { method: "POST", body: formData });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.detail?.message || body.message || "Không thể trích xuất nội dung từ tệp.");
  }

  extractedRawTexts[kind] = body.text ?? body.content ?? "";
  const textArea = $(`#${kind}-text`);
  if (textArea) textArea.value = extractedRawTexts[kind];

  updateCount(kind);
  showFileMessage(kind, `✓ Đã trích xuất văn bản ${body.method ? `· ${body.method}` : ""}`);
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
      <div class="cv-col-sidebar">
        ${fieldCard("SKILLS", "Kỹ năng chuyên môn & cá nhân", renderList(profile.skills, true), "", skillsCount)}
        ${fieldCard("EDUCATION", "Học vấn", renderEntries(profile.education), "", eduCount)}
        <div class="cv-subgrid-two">
          ${fieldCard("LANGUAGES", "Ngoại ngữ", renderList(profile.languages))}
          ${fieldCard("CERTIFICATES", "Chứng chỉ", renderList(profile.certificates, false, "Không yêu cầu / Chưa cập nhật"))}
        </div>
      </div>
      <div class="cv-col-main">
        ${fieldCard("PROJECTS", "Dự án tiêu biểu", renderEntries(profile.projects), "", projectsCount)}
        ${fieldCard(
          "EXPERIENCE",
          "Kinh nghiệm làm việc",
          renderEntries(profile.experience, "Ứng viên chưa liệt kê mục Kinh nghiệm làm việc riêng (thường gặp ở hồ sơ Sinh viên / Thực tập sinh)."),
          "",
          expCount
        )}
      </div>
    </div>
  `;
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

  const requirementBody = `<div class="req-groups-grid">
    ${requirementGroup("Kỹ năng bắt buộc", requirements.mandatory_skills)}
    ${requirementGroup("Công nghệ & Công cụ nhận diện", requirements.technologies_tools, true)}
    ${requirementGroup("Kinh nghiệm yêu cầu", requirements.experience)}
    ${requirementGroup("Trình độ học vấn", requirements.education)}
    ${requirementGroup("Chuyên ngành liên quan", requirements.fields_of_study, true)}
    ${requirementGroup("Ngoại ngữ", requirements.languages)}
    ${requirementGroup("Chứng chỉ", requirements.certificates, false, "Không yêu cầu")}
    ${requirementGroup("Yêu cầu khác", requirements.other_requirements)}
  </div>`;

  const container = $("#extraction-fields");
  if (!container) return;

  container.innerHTML = `
    ${jdHero}
    <div class="jd-structured-layout">
      <div class="jd-col-left">
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
      </div>
      <div class="jd-col-right">
        ${fieldCard("REQUIREMENTS", "Chi tiết yêu cầu ứng viên", requirementBody)}
      </div>
    </div>
  `;
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

    if (!sources.length) {
      if (!rawTextReady()) {
        ["cv", "jd"]
          .filter((kind) => !getEffectiveText(kind))
          .forEach((kind) => showFileMessage(kind, "Hãy tải tệp hoặc dán nội dung trước.", true));
      } else {
        button.innerHTML = "<span>✓</span> Văn bản đã sẵn sàng <b>→</b>";
      }
      syncPipeline();
      return;
    }

    button.classList.add("loading");
    button.innerHTML = "<span>◌</span> Đang trích xuất văn bản…";

    try {
      await Promise.all(sources.map((kind) => extractFile(kind, selectedFiles[kind])));
      button.innerHTML = "<span>✓</span> Đã trích xuất văn bản <b>→</b>";
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
      if (!response.ok) throw new Error(body.detail?.message || "Không thể trích xuất thông tin.");

      extractedProfiles = body;
      setExtractionTab("cv");
      showStage(2);

      const matchBtn = $("#pipeline-match-button");
      if (matchBtn) {
        matchBtn.disabled = false;
        matchBtn.closest(".workflow-action")?.classList.add("ready");
      }

      button.innerHTML = "<span>✓</span> Đã trích xuất";
      $("#extraction-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Đã có lỗi xảy ra.";
      button.innerHTML = "<span>!</span> Trích xuất lỗi";
      window.alert(message);
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
      if (!response.ok) throw new Error(body.detail?.message || "Không thể đánh giá mức độ phù hợp.");
      renderMatch(body);
      showStage(3);
      button.innerHTML = "<span>✓</span> Đã đánh giá";
      $("#match-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      button.innerHTML = "<span>!</span> Đánh giá lỗi";
      window.alert(error instanceof Error ? error.message : "Đã có lỗi xảy ra.");
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

syncPipeline();


/* =========================================================================
   MODE SWITCHING & MULTI-CV BATCH RANKING (1 JD vs N CVs)
   ========================================================================= */
let activeMode = "single";
let batchCandidates = []; // [{id, filename, language, cv_text}]
let lastBatchResponse = null;
let activeLangFilter = "all";
let viewingBatchDetail = false;

function setMode(mode) {
  activeMode = mode;
  viewingBatchDetail = false;
  $("#batch-detail-banner")?.classList.add("hidden");
  $("#back-to-extraction")?.classList.remove("hidden");
  document.querySelectorAll(".mode-tab").forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  $("#single-mode-container")?.classList.toggle("hidden", mode !== "single");
  $("#batch-mode-container")?.classList.toggle("hidden", mode !== "batch");

  if (mode === "batch") {
    $("#match-result")?.classList.add("hidden");
  } else {
    // Restore single mode stage cleanly
    if (lastMatchReport) showStage(3);
    else if (extractedProfiles) showStage(2);
    else showStage(1);
  }
}

document.querySelectorAll(".mode-tab").forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

function detectLangFromFilename(name) {
  const m = String(name || "").match(/_(vi|en|bi)\./i);
  return m ? m[1].toLowerCase() : "";
}

function updateBatchReadyState() {
  const jdVal = $("#batch-jd-text")?.value.trim() || "";
  const jdCount = $("#batch-jd-count");
  if (jdCount) jdCount.textContent = `${jdVal.length.toLocaleString("vi-VN")} ký tự`;

  const badge = $("#batch-cv-badge");
  if (badge) badge.textContent = `${batchCandidates.length} CV`;

  const clearBtn = $("#clear-batch-cvs-btn");
  if (clearBtn) clearBtn.disabled = batchCandidates.length === 0;

  const runBtn = $("#run-batch-rank-btn");
  if (runBtn) runBtn.disabled = !(jdVal.length > 0 && batchCandidates.length > 0);
}

function renderBatchCvList() {
  const container = $("#batch-cv-list");
  if (!container) return;
  if (!batchCandidates.length) {
    container.innerHTML =
      '<p class="batch-empty-hint">Chưa có hồ sơ ứng viên nào. Hãy chọn nhiều tệp CV hoặc bấm chọn một bộ dữ liệu mẫu ở thanh phía trên.</p>';
    updateBatchReadyState();
    return;
  }
  container.innerHTML = batchCandidates
    .map(
      (cand, idx) => `<div class="batch-cv-item">
        <div class="batch-cv-meta">
          <span class="entry-index">${String(idx + 1).padStart(2, "0")}</span>
          ${cand.language ? `<span class="lang-pill lang-${escapeHtml(cand.language)}">${escapeHtml(cand.language)}</span>` : ""}
          <strong title="${escapeHtml(cand.filename)}">${escapeHtml(cand.filename)}</strong>
          <small>${cand.cv_text.length.toLocaleString("vi-VN")} ký tự</small>
        </div>
        <button type="button" class="remove-cv-btn" data-remove-cv="${escapeHtml(cand.id)}" aria-label="Xóa CV">×</button>
      </div>`
    )
    .join("");

  container.querySelectorAll("[data-remove-cv]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-remove-cv");
      batchCandidates = batchCandidates.filter((c) => c.id !== id);
      renderBatchCvList();
    });
  });
  updateBatchReadyState();
}

async function extractTextForFile(file) {
  if (file.size > maxFileSize) {
    throw new Error(`${file.name}: vượt quá 10MB`);
  }
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/extract-text", { method: "POST", body: formData });
  const body = await res.json();
  if (!res.ok) throw new Error(`${file.name}: ${body.detail?.message || "lỗi đọc tệp"}`);
  return body.text || "";
}

async function handleBatchJdFile(file) {
  if (!file) return;
  const msg = $("#batch-jd-file-name");
  if (msg) {
    msg.style.color = "";
    msg.textContent = `◌ Đang trích xuất JD: ${file.name}`;
  }
  try {
    const text = await extractTextForFile(file);
    const ta = $("#batch-jd-text");
    if (ta) ta.value = text;
    if (msg) msg.textContent = `✓ Đã nạp JD: ${file.name}`;
  } catch (err) {
    if (msg) {
      msg.style.color = "#c85841";
      msg.textContent = err instanceof Error ? err.message : "Lỗi đọc tệp JD.";
    }
  } finally {
    updateBatchReadyState();
  }
}

async function handleBatchCvFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const status = $("#batch-cv-status");
  if (status) {
    status.style.color = "";
    status.textContent = `◌ Đang trích xuất ${files.length} tệp CV…`;
  }
  let okCount = 0;
  const errors = [];
  await Promise.all(
    files.map(async (file, idx) => {
      try {
        const text = await extractTextForFile(file);
        if (!text.trim()) {
          errors.push(`${file.name}: rỗng`);
          return;
        }
        batchCandidates.push({
          id: `up-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          filename: file.name,
          language: detectLangFromFilename(file.name),
          cv_text: text,
        });
        okCount += 1;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : file.name);
      }
    })
  );
  if (status) {
    status.style.color = errors.length && !okCount ? "#c85841" : "";
    status.textContent = errors.length
      ? `✓ Đã nạp ${okCount}/${files.length} CV (${errors.length} lỗi: ${errors[0]})`
      : `✓ Đã nạp thành công ${okCount} tệp CV`;
  }
  renderBatchCvList();
}

// Wire Batch JD upload zone
const batchJdZone = $("#batch-jd-dropzone");
const batchJdInput = $("#batch-jd-file");
if (batchJdZone && batchJdInput) {
  batchJdZone.addEventListener("click", (e) => {
    if (e.target !== batchJdInput) batchJdInput.click();
  });
  batchJdInput.addEventListener("click", (e) => e.stopPropagation());
  batchJdInput.addEventListener("change", () => {
    if (batchJdInput.files?.[0]) handleBatchJdFile(batchJdInput.files[0]);
  });
  ["dragenter", "dragover"].forEach((ev) =>
    batchJdZone.addEventListener(ev, (e) => {
      e.preventDefault();
      batchJdZone.classList.add("dragging");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    batchJdZone.addEventListener(ev, (e) => {
      e.preventDefault();
      batchJdZone.classList.remove("dragging");
    })
  );
  batchJdZone.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.[0]) handleBatchJdFile(e.dataTransfer.files[0]);
  });
}
$("#batch-jd-text")?.addEventListener("input", updateBatchReadyState);

// Wire Batch Multi-CV upload zone
const batchCvZone = $("#batch-cv-dropzone");
const batchCvInput = $("#batch-cv-files");
if (batchCvZone && batchCvInput) {
  batchCvZone.addEventListener("click", (e) => {
    if (e.target !== batchCvInput) batchCvInput.click();
  });
  batchCvInput.addEventListener("click", (e) => e.stopPropagation());
  batchCvInput.addEventListener("change", () => {
    if (batchCvInput.files?.length) {
      handleBatchCvFiles(batchCvInput.files);
      batchCvInput.value = "";
    }
  });
  ["dragenter", "dragover"].forEach((ev) =>
    batchCvZone.addEventListener(ev, (e) => {
      e.preventDefault();
      batchCvZone.classList.add("dragging");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    batchCvZone.addEventListener(ev, (e) => {
      e.preventDefault();
      batchCvZone.classList.remove("dragging");
    })
  );
  batchCvZone.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) handleBatchCvFiles(e.dataTransfer.files);
  });
}

// Manual CV addition & clear all
$("#toggle-manual-cv-btn")?.addEventListener("click", () => {
  $("#manual-cv-box")?.classList.toggle("hidden");
});
$("#cancel-manual-cv-btn")?.addEventListener("click", () => {
  $("#manual-cv-box")?.classList.add("hidden");
});
$("#add-manual-cv-btn")?.addEventListener("click", () => {
  const name = $("#manual-cv-name")?.value.trim() || `CV_nhap_tay_${batchCandidates.length + 1}.txt`;
  const text = $("#manual-cv-text")?.value.trim() || "";
  if (!text) {
    window.alert("Vui lòng dán nội dung CV trước khi thêm.");
    return;
  }
  batchCandidates.push({
    id: `man-${Date.now()}`,
    filename: name,
    language: detectLangFromFilename(name),
    cv_text: text,
  });
  if ($("#manual-cv-name")) $("#manual-cv-name").value = "";
  if ($("#manual-cv-text")) $("#manual-cv-text").value = "";
  $("#manual-cv-box")?.classList.add("hidden");
  renderBatchCvList();
});
$("#clear-batch-cvs-btn")?.addEventListener("click", () => {
  batchCandidates = [];
  if ($("#batch-cv-status")) $("#batch-cv-status").textContent = "";
  renderBatchCvList();
});

// Weight preset buttons & summary update
function readBatchConfig() {
  const wJob = Number($("#w-job")?.value ?? 40);
  const wSkill = Number($("#w-skill")?.value ?? 35);
  const wExp = Number($("#w-exp")?.value ?? 15);
  const wEdu = Number($("#w-edu")?.value ?? 10);
  return {
    config: {
      weights: {
        job_fit: Math.max(0, wJob),
        skill_match: Math.max(0, wSkill),
        experience_match: Math.max(0, wExp),
        education_match: Math.max(0, wEdu),
      },
      enable_semantic: Boolean($("#cfg-semantic")?.checked ?? true),
      enable_one_to_one: Boolean($("#cfg-one-to-one")?.checked ?? true),
      enable_job_fit: Boolean($("#cfg-job-fit")?.checked ?? true),
      enable_dynamic_weights: Boolean($("#cfg-dynamic")?.checked ?? true),
      enable_project_bonus: Boolean($("#cfg-bonus")?.checked ?? true),
    },
    include_baselines: Boolean($("#cfg-baselines")?.checked ?? true),
    include_sbert: Boolean($("#cfg-sbert")?.checked ?? false),
  };
}

function syncConfigSummary() {
  const { config, include_baselines, include_sbert } = readBatchConfig();
  const w = config.weights;
  const enabledCount = [
    config.enable_semantic,
    config.enable_one_to_one,
    config.enable_job_fit,
    config.enable_dynamic_weights,
    config.enable_project_bonus,
  ].filter(Boolean).length;
  const baseLabel = include_baselines
    ? include_sbert
      ? "Kèm 3 Baseline (KW + TF-IDF + SBERT)"
      : "Kèm 2 Baseline (KW + TF-IDF)"
    : "Không chạy Baseline";
  const node = $("#config-summary-text");
  if (node) {
    node.textContent = `Trọng số: ${w.job_fit}% Mô tả · ${w.skill_match}% Kỹ năng · ${w.experience_match}% Kinh nghiệm · ${w.education_match}% Học vấn · ${enabledCount}/5 mô-đun bật · ${baseLabel}`;
  }
}

document.querySelectorAll(".preset-pill[data-weights]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const [j, s, ex, ed] = btn.dataset.weights.split(",");
    if ($("#w-job")) $("#w-job").value = j;
    if ($("#w-skill")) $("#w-skill").value = s;
    if ($("#w-exp")) $("#w-exp").value = ex;
    if ($("#w-edu")) $("#w-edu").value = ed;
    syncConfigSummary();
  });
});
["w-job", "w-skill", "w-exp", "w-edu", "cfg-semantic", "cfg-one-to-one", "cfg-job-fit", "cfg-dynamic", "cfg-bonus", "cfg-baselines", "cfg-sbert"].forEach(
  (id) => $(`#${id}`)?.addEventListener("change", syncConfigSummary)
);

// Load available dataset presets from CV_JD_Dataset
async function initDatasetPresets() {
  try {
    const res = await fetch("/api/dataset-presets");
    if (!res.ok) return;
    const data = await res.json();
    const presets = data.presets || [];
    if (!presets.length) return;
    const bar = $("#dataset-preset-bar");
    const chips = $("#dataset-preset-chips");
    if (!bar || !chips) return;
    bar.classList.remove("hidden");
    chips.innerHTML = presets
      .map(
        (p) => `<button type="button" class="preset-load-btn" data-preset-id="${escapeHtml(p.id)}">
          ${escapeHtml(p.label)} <span>${p.cv_count} CV</span>
        </button>`
      )
      .join("");
    chips.querySelectorAll("[data-preset-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const presetId = btn.getAttribute("data-preset-id");
        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = "◌ Đang nạp…";
        try {
          const r = await fetch(`/api/dataset-presets/${encodeURIComponent(presetId)}`, { method: "POST" });
          const body = await r.json();
          if (!r.ok) throw new Error(body.detail?.message || "Không thể nạp bộ dữ liệu mẫu.");
          if ($("#batch-jd-text")) $("#batch-jd-text").value = body.jd_text || "";
          if ($("#batch-jd-file-name")) $("#batch-jd-file-name").textContent = `✓ Bộ mẫu: ${body.jd_filename}`;
          batchCandidates = body.candidates || [];
          if ($("#batch-cv-status")) {
            $("#batch-cv-status").textContent = `✓ Đã nạp ${batchCandidates.length} CV từ ${presetId}`;
          }
          renderBatchCvList();
          // Immediately show input stage if results were open
          $("#batch-input-stage")?.classList.remove("hidden");
          $("#batch-results")?.classList.add("hidden");
          $("#match-result")?.classList.add("hidden");
        } catch (err) {
          window.alert(err instanceof Error ? err.message : "Lỗi nạp dữ liệu mẫu.");
        } finally {
          btn.disabled = false;
          btn.innerHTML = origHtml;
        }
      });
    });
  } catch {
    // Ignore if presets endpoint unavailable
  }
}

function scoreTone(score) {
  if (score == null) return "";
  if (score >= 70) return "high";
  if (score >= 45) return "mid";
  return "low";
}

function renderBatchTable() {
  if (!lastBatchResponse) return;
  const tbody = $("#batch-ranking-body");
  if (!tbody) return;

  const query = ($("#batch-search-input")?.value || "").trim().toLowerCase();
  const sortKey = $("#batch-sort-select")?.value || "overall";
  const showSbert = Boolean(lastBatchResponse.sbert_included);
  const thBase = $("#th-baselines");
  if (thBase) {
    thBase.textContent = showSbert ? "Baseline (KW / TF-IDF / SBERT)" : "Baseline (KW / TF-IDF)";
  }

  let rows = [...(lastBatchResponse.rankings || [])];
  if (activeLangFilter !== "all") {
    rows = rows.filter((r) => r.language === activeLangFilter);
  }
  if (query) {
    rows = rows.filter(
      (r) =>
        r.candidate_name.toLowerCase().includes(query) ||
        r.filename.toLowerCase().includes(query) ||
        (r.missing_required_skills || []).some((s) => s.toLowerCase().includes(query))
    );
  }

  const sortAccessor = {
    overall: (r) => r.overall_score ?? -1,
    skill: (r) => r.skill_match ?? -1,
    job_fit: (r) => r.job_fit ?? -1,
    experience: (r) => r.experience_match ?? -1,
    baseline_keyword: (r) => r.baseline_keyword ?? -1,
    baseline_tfidf: (r) => r.baseline_tfidf ?? -1,
    baseline_sbert: (r) => r.baseline_sbert ?? -1,
  }[sortKey];
  if (sortAccessor) {
    rows.sort((a, b) => sortAccessor(b) - sortAccessor(a));
  }

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#5d6e69;padding:28px;">Không có ứng viên nào khớp bộ lọc hiện tại.</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const tone = scoreTone(row.overall_score);
      const rankClass = row.rank <= 3 ? `rank-${row.rank}` : "";
      const missing = row.missing_required_skills || [];
      const missingHtml = missing.length
        ? `<span class="missing-pill" title="${escapeHtml(missing.join(", "))}">${missing.length}: ${escapeHtml(missing.join(", "))}</span>`
        : `<span class="missing-pill none">Đủ bắt buộc</span>`;
      const baseText =
        row.baseline_keyword != null
          ? showSbert && row.baseline_sbert != null
            ? `${row.baseline_keyword.toFixed(1)} / ${row.baseline_tfidf.toFixed(1)} / ${row.baseline_sbert.toFixed(1)}`
            : `${row.baseline_keyword.toFixed(1)} / ${row.baseline_tfidf.toFixed(1)}`
          : "—";
      return `<tr>
        <td><span class="rank-badge ${rankClass}">#${row.rank}</span></td>
        <td class="cand-cell">
          <strong>${escapeHtml(row.candidate_name)}</strong>
          <div class="cand-cell-sub">
            ${row.language ? `<span class="lang-pill lang-${escapeHtml(row.language)}">${escapeHtml(row.language)}</span>` : ""}
            <span>${escapeHtml(row.filename)}</span>
          </div>
        </td>
        <td class="score-bar-cell ${tone}">
          <strong>${formatScore(row.overall_score)}</strong>
          <div class="mini-bar"><i style="width:${Math.min(100, row.overall_score || 0)}%"></i></div>
        </td>
        <td class="mono-num">${formatScore(row.job_fit)}</td>
        <td class="mono-num">${formatScore(row.skill_match)}</td>
        <td class="mono-num">${formatScore(row.experience_match)}</td>
        <td class="mono-num">${formatScore(row.education_match)}</td>
        <td><span class="bonus-pill">+${(row.project_bonus_applied_points || 0).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}</span></td>
        <td class="mono-num">${baseText}</td>
        <td>${missingHtml}</td>
        <td><button type="button" class="inspect-btn" data-inspect-id="${escapeHtml(row.id)}">Xem chi tiết →</button></td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-inspect-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-inspect-id");
      const item = (lastBatchResponse.rankings || []).find((r) => r.id === id);
      if (!item) return;
      viewingBatchDetail = true;
      renderMatch(item.report);
      $("#batch-mode-container")?.classList.add("hidden");
      $("#batch-detail-banner")?.classList.remove("hidden");
      if ($("#batch-detail-candidate-title")) {
        $("#batch-detail-candidate-title").textContent = `Hạng #${item.rank} — ${item.candidate_name} (${item.filename}) · Tổng điểm ${formatScore(item.overall_score)}`;
      }
      $("#back-to-extraction")?.classList.add("hidden");
      $("#match-result")?.classList.remove("hidden");
      $("#match-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderBatchDashboard(data) {
  lastBatchResponse = data;
  const stats = data.summary_stats || {};
  const jdTitle = data.jd_profile?.job_info?.title || "Vị trí tuyển dụng";
  const topCand = data.rankings?.[0];
  if ($("#batch-result-title")) {
    $("#batch-result-title").textContent = `Xếp hạng ${data.total_candidates} ứng viên — ${jdTitle}`;
  }
  const statsGrid = $("#batch-stats-grid");
  if (statsGrid) {
    statsGrid.innerHTML = `
      <article class="batch-stat-card highlight">
        <span>ỨNG VIÊN HẠNG #1</span>
        <strong>${formatScore(stats.top_score)}</strong>
        <small>${escapeHtml(topCand ? topCand.candidate_name : "—")}</small>
      </article>
      <article class="batch-stat-card">
        <span>TỔNG SỐ HỒ SƠ ĐÃ CHẤM</span>
        <strong>${data.total_candidates}</strong>
        <small>Taxonomy v${escapeHtml(data.taxonomy_version || "1.3.0")}</small>
      </article>
      <article class="batch-stat-card">
        <span>ĐIỂM TRUNG BÌNH / TRUNG VỊ</span>
        <strong>${formatScore(stats.avg_score)}</strong>
        <small>Trung vị: ${formatScore(stats.median_score)}</small>
      </article>
      <article class="batch-stat-card">
        <span>ỨNG VIÊN ĐẠT ≥ 70%</span>
        <strong>${stats.qualified_count ?? 0} / ${data.total_candidates}</strong>
        <small>Gợi ý ưu tiên mời phỏng vấn</small>
      </article>
    `;
  }
  renderBatchTable();
  $("#batch-input-stage")?.classList.add("hidden");
  $("#batch-results")?.classList.remove("hidden");
  $("#batch-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

$("#run-batch-rank-btn")?.addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const jdText = $("#batch-jd-text")?.value.trim() || "";
  if (!jdText || !batchCandidates.length) return;
  const payload = {
    jd_text: jdText,
    candidates: batchCandidates,
    ...readBatchConfig(),
  };
  button.classList.add("loading");
  button.disabled = true;
  button.innerHTML = `<span>◌</span> Đang xếp hạng ${batchCandidates.length} ứng viên…`;
  try {
    const res = await fetch("/api/match-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.detail?.message || "Không thể chạy xếp hạng hàng loạt.");
    renderBatchDashboard(body);
  } catch (err) {
    window.alert(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
  } finally {
    button.classList.remove("loading");
    button.innerHTML = "<span>✦</span> So sánh &amp; Xếp hạng ứng viên <b>→</b>";
    updateBatchReadyState();
  }
});

$("#batch-edit-inputs-btn")?.addEventListener("click", () => {
  $("#batch-results")?.classList.add("hidden");
  $("#batch-input-stage")?.classList.remove("hidden");
});

$("#back-to-leaderboard-btn")?.addEventListener("click", () => {
  viewingBatchDetail = false;
  $("#match-result")?.classList.add("hidden");
  $("#batch-detail-banner")?.classList.add("hidden");
  $("#back-to-extraction")?.classList.remove("hidden");
  $("#batch-mode-container")?.classList.remove("hidden");
  $("#batch-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#batch-search-input")?.addEventListener("input", renderBatchTable);
$("#batch-sort-select")?.addEventListener("change", renderBatchTable);
document.querySelectorAll("#lang-filter-pills .filter-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    activeLangFilter = pill.dataset.lang || "all";
    document.querySelectorAll("#lang-filter-pills .filter-pill").forEach((p) => {
      p.classList.toggle("active", p === pill);
    });
    renderBatchTable();
  });
});

$("#export-csv-btn")?.addEventListener("click", () => {
  if (!lastBatchResponse?.rankings?.length) return;
  const headers = [
    "Hang",
    "Ung_vien",
    "Tep_CV",
    "Ngon_ngu",
    "Tong_diem",
    "Diem_nen",
    "Thuong_du_an",
    "Mo_ta_CV",
    "Ky_nang",
    "Kinh_nghiem",
    "Hoc_van",
    "Baseline_Keyword",
    "Baseline_TFIDF",
    "Baseline_SBERT",
    "Ky_nang_bat_buoc_thieu",
  ];
  const csvEsc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    headers.join(","),
    ...lastBatchResponse.rankings.map((r) =>
      [
        r.rank,
        r.candidate_name,
        r.filename,
        r.language,
        r.overall_score ?? "",
        r.base_score ?? "",
        r.project_bonus_applied_points ?? "",
        r.job_fit ?? "",
        r.skill_match ?? "",
        r.experience_match ?? "",
        r.education_match ?? "",
        r.baseline_keyword ?? "",
        r.baseline_tfidf ?? "",
        r.baseline_sbert ?? "",
        (r.missing_required_skills || []).join("; "),
      ]
        .map(csvEsc)
        .join(",")
    ),
  ];
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bang_xep_hang_ung_vien.csv";
  a.click();
  URL.revokeObjectURL(url);
});

syncConfigSummary();
initDatasetPresets();
