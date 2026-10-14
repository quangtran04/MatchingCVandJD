const $ = (selector) => document.querySelector(selector);
const selectedFiles = { cv: null, jd: null };
const extractedRawTexts = { cv: "", jd: "" };
const maxFileSize = 10 * 1024 * 1024;
let extractedProfiles = null;

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

  // Hiển thị văn bản để người dùng kiểm tra và chỉnh sửa trước khi chấm điểm.
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

function fieldCard(label, title, body, wide = false) {
  return `<article class="field-card${wide ? " wide" : ""}"><p class="mini-label">${escapeHtml(label)}</p><h3>${escapeHtml(title)}</h3>${body}</article>`;
}

function renderEntries(entries) {
  if (!entries?.length) return '<p class="empty-value">Chưa tìm thấy thông tin.</p>';
  return `<div class="field-list">${entries
    .map(
      (entry) =>
        `<div class="field-entry"><b>${escapeHtml(entry.title)}</b>${
          entry.date ? `<time>${escapeHtml(entry.date)}</time>` : ""
        }<p class="field-text">${escapeHtml(entry.details || "")}</p></div>`
    )
    .join("")}</div>`;
}

function renderList(values, tags = false, emptyText = "Chưa tìm thấy thông tin.") {
  if (!values?.length) return `<p class="empty-value">${escapeHtml(emptyText)}</p>`;
  if (tags) return `<div class="tag-list">${values.map((value) => `<span>${escapeHtml(value)}</span>`).join("")}</div>`;
  return `<div class="field-list">${values.map((value) => `<div class="field-entry"><p class="field-text">${escapeHtml(value)}</p></div>`).join("")}</div>`;
}

function renderProfile(profile) {
  const personal = Object.entries(profile.personal_info || {});
  const personalBody = personal.length
    ? `<div class="personal-grid">${personal
        .map(([key, value]) => `<div class="personal-item"><span>${escapeHtml(key.replace(/_/g, " "))}</span><b>${escapeHtml(value)}</b></div>`)
        .join("")}</div>`
    : '<p class="empty-value">Chưa tìm thấy thông tin.</p>';

  const container = $("#extraction-fields");
  if (!container) return;

  container.innerHTML = [
    fieldCard("PERSONAL INFO", "Thông tin cá nhân", personalBody),
    fieldCard("SUMMARY", "Tóm tắt hồ sơ", profile.summary ? `<p class="field-text">${escapeHtml(profile.summary)}</p>` : '<p class="empty-value">Chưa tìm thấy thông tin.</p>', true),
    fieldCard("SKILLS", "Kỹ năng", renderList(profile.skills, true)),
    fieldCard("EXPERIENCE", "Kinh nghiệm", renderEntries(profile.experience), true),
    fieldCard("EDUCATION", "Học vấn", renderEntries(profile.education)),
    fieldCard("PROJECTS", "Dự án", renderEntries(profile.projects), true),
    fieldCard("CERTIFICATES", "Chứng chỉ", renderList(profile.certificates, false, "Không yêu cầu")),
    fieldCard("LANGUAGES", "Ngoại ngữ", renderList(profile.languages)),
  ].join("");
}

function renderInfoRows(values, labels) {
  const rows = Object.entries(labels).map(([key, label]) => [label, values?.[key] || "Chưa xác định"]);
  return `<div class="personal-grid">${rows
    .map(([label, value]) => `<div class="personal-item"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`)
    .join("")}</div>`;
}

function requirementGroup(label, values, tags = false, emptyText = "Chưa tìm thấy thông tin.") {
  return `<div class="field-entry"><b>${escapeHtml(label)}</b>${renderList(values, tags, emptyText)}</div>`;
}

function renderJobProfile(profile) {
  const job = profile.job_info || {};
  const description = profile.job_description || {};
  const requirements = profile.requirements || {};

  const requirementBody = [
    requirementGroup("Kỹ năng bắt buộc", requirements.mandatory_skills),
    requirementGroup("Yêu cầu khác", requirements.other_requirements),
    requirementGroup("Kinh nghiệm", requirements.experience),
    requirementGroup("Học vấn", requirements.education),
    requirementGroup("Ngành học", requirements.fields_of_study, true),
    requirementGroup("Chứng chỉ", requirements.certificates, false, "Không yêu cầu"),
    requirementGroup("Ngoại ngữ", requirements.languages),
    requirementGroup("Công nghệ & công cụ", requirements.technologies_tools, true),
  ].join("");

  const container = $("#extraction-fields");
  if (!container) return;

  container.innerHTML = [
    fieldCard(
      "JOB INFO",
      "Job Information",
      renderInfoRows(job, {
        title: "Job Title",
        department: "Department",
        level: "Seniority Level",
        location: "Location",
        employment_type: "Employment Type",
      })
    ),
    fieldCard("JOB DESCRIPTION", "Mô tả công việc", description.description ? `<p class="field-text">${escapeHtml(description.description)}</p>` : '<p class="empty-value">Chưa tìm thấy mô tả tổng quan.</p>', true),
    fieldCard("RESPONSIBILITIES", "Nhiệm vụ & trách nhiệm", renderList(description.responsibilities), true),
    fieldCard("REQUIREMENTS", "Yêu cầu bắt buộc", `<div class="field-list">${requirementBody}</div>`, true),
    fieldCard("PREFERRED REQUIREMENTS", "Yêu cầu ưu tiên", renderList(profile.preferred_requirements), true),
  ].join("");
}

function formatScore(value) {
  return value == null ? "N/A" : `${value.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
}

function reportSource(label, value) {
  if (!value) return '';
  return `<div class='report-source'><span>${escapeHtml(label)}</span><p>${escapeHtml(value)}</p></div>`;
}

function reportColumn(title, items, tone, emptyText) {
  const rows = items.map((item) => `<li class='report-item'>
    <span class='report-item-icon' aria-hidden='true'>${tone === 'matched' ? '✓' : tone === 'review' ? '?' : '!'}</span>
    <div><div class='report-item-title'>${escapeHtml(item.title)}${item.badge ? `<span class='report-badge'>${escapeHtml(item.badge)}</span>` : ''}</div>
    ${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ''}</div>
  </li>`).join('');
  return `<div class='report-column report-column-${tone}'>
    <div class='report-column-heading'><h5>${title}</h5><span>${items.length}</span></div>
    ${items.length ? `<ul>${rows}</ul>` : `<p class='report-empty'>${emptyText}</p>`}
  </div>`;
}

function reportSection(id, number, title, subtitle, metric, matched, missing, sources, emptyMessage) {
  const score = metric.score;
  const sourceList = sources.map((source) => reportSource(source.label, source.text)).join('');
  const weight = score == null ? 'N/A' : formatScore(metric.effective_weight * 100);
  const body = score == null
    ? `<div class='report-unavailable'>${escapeHtml(emptyMessage || metric.reason)}</div>`
    : `<div class='report-columns'>
        ${reportColumn('Đã khớp', matched, 'matched', 'Chưa ghi nhận mục phù hợp.')}
        ${reportColumn('Chưa khớp', missing, 'missing', 'Không có mục nào cần xem xét.')}
      </div>`;
  return `<article class='report-section' id='${id}'>
    <div class='report-section-top'>
      <span class='report-section-number'>${number}</span>
      <div class='report-section-title'><h4>${title}</h4><p>${subtitle}</p></div>
      <strong class='report-section-score ${score == null ? 'is-na' : ''}'>${formatScore(score)}</strong>
    </div>
    ${body}
    <details class='report-calculation'><summary>Xem cách tính &amp; bằng chứng</summary>
      <div class='report-calculation-body'>
        <p>${escapeHtml(metric.reason)}</p>
        <p>Trọng số áp dụng: <b>${weight}</b> · Đóng góp: <b>${metric.weighted_points.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} điểm</b></p>
        ${sourceList || `<p class='report-empty'>Không có văn bản nguồn cho tiêu chí này.</p>`}
      </div>
    </details>
  </article>`;
}

function reportEvidenceSection(items) {
  if (!items.length) return '';
  const supported = items.filter((item) => item.status !== 'unverified').map((item) => ({
    title: item.jd_text,
    detail: `CV · ${item.cv_section}: ${item.cv_evidence.length > 180 ? `${item.cv_evidence.slice(0, 180)}…` : item.cv_evidence}`,
    badge: item.priority === 'preferred' ? 'Ưu tiên' : '',
  }));
  const unverified = items.filter((item) => item.status === 'unverified').map((item) => ({
    title: item.jd_text,
    detail: 'CV chưa có bằng chứng đủ rõ; cần hỏi thêm khi phỏng vấn.',
    badge: item.priority === 'preferred' ? 'Ưu tiên' : '',
  }));
  return `<article class='report-section' id='report-other'>
    <div class='report-section-top'>
      <span class='report-section-number'>04</span>
      <div class='report-section-title'><h4>Công việc & yêu cầu khác</h4><p>Đối chiếu nhiệm vụ, động lực, cách làm việc và điểm ưu tiên với bằng chứng CV.</p></div>
      <strong class='report-section-score is-na is-label'>Không chấm điểm</strong>
    </div>
    <div class='report-columns'>
      ${reportColumn('Có bằng chứng liên quan', supported, 'matched', 'Chưa tìm thấy bằng chứng liên quan.')}
      ${reportColumn('Cần xác minh thêm', unverified, 'review', 'Không có mục nào cần xác minh thêm.')}
    </div>
    <p class='report-evidence-note'>Dấu hiệu liên quan không khẳng định phẩm chất cá nhân; các mục chưa xác minh không bị trừ điểm.</p>
    <details class='report-calculation'><summary>Xem bằng chứng đầy đủ</summary>
      <div class='report-calculation-body'>${items.filter((item) => item.status !== 'unverified').map((item) => reportSource(`JD · ${item.jd_text}`, `CV · ${item.cv_section}: ${item.cv_evidence}`)).join('')}</div>
    </details>
  </article>`;
}

function renderMatch(report) {
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
  $('#score-ring').style.setProperty('--score', `${overall ?? 0}%`);
  $('#overall-value').textContent = overall == null ? 'N/A' : overall.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  $('#overall-unit').textContent = overall == null ? '' : '%';
  $('#overall-title').textContent = overall == null ? 'Chưa đủ dữ liệu' : 'Kết quả đánh giá';
  const active = ['skill_match', 'experience_match', 'education_match'].filter((key) => scores[key].score != null).length;
  $('#overall-summary').textContent = `${active}/3 tiêu chí có dữ liệu · Điểm nền ${formatScore(report.base_score)}. Điểm chỉ hỗ trợ người đánh giá.`;

  const overview = [
    { key: 'skill_match', id: 'report-skills', title: 'Kỹ năng', note: `${skillMatches.length}/${required.length + preferred.length} yêu cầu` },
    { key: 'experience_match', id: 'report-experience', title: 'Kinh nghiệm', note: experience.jd_required_years == null ? 'JD không nêu số năm' : `Yêu cầu ${experience.jd_required_years} năm` },
    { key: 'education_match', id: 'report-education', title: 'Học vấn', note: (education.jd_degree || (education.jd_fields || []).length) ? 'Học vị & ngành học' : 'JD không nêu yêu cầu' },
  ];
  $('#metric-list').innerHTML = overview.map(({ key, id, title, note }) => {
    const score = scores[key].score;
    return `<a class='report-score-card ${score == null ? 'is-na' : ''}' href='#${id}'>
      <span>${title}</span><strong>${formatScore(score)}</strong><small>${escapeHtml(note)}</small>
      <i style='--value: ${score ?? 0}%'></i>
    </a>`;
  }).join('');

  const warning = $('#report-warning');
  warning.hidden = missingRequired.length === 0;
  warning.innerHTML = missingRequired.length
    ? `<span aria-hidden='true'>!</span><p><b>${missingRequired.length} kỹ năng bắt buộc chưa khớp.</b> Xem chi tiết trong phần Kỹ năng; kết quả không tự động loại ứng viên.</p><a href='#report-skills'>Xem kỹ năng →</a>`
    : '';

  const bonus = $('#project-bonus');
  bonus.hidden = projectMatches.length === 0;
  bonus.open = false;
  const earnedBonus = report.project_bonus_points || 0;
  const appliedBonus = report.project_bonus_applied_points || 0;
  const capNote = earnedBonus > appliedBonus
    ? ` · đạt ${earnedBonus.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} điểm nhưng tổng giới hạn 100`
    : '';
  $('#project-bonus-value').textContent = `+${appliedBonus.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} điểm dự án`;
  $('#project-bonus-summary').textContent = `${projectMatches.length} kỹ năng JD có bằng chứng trong Projects · tối đa +10 điểm · không trừ điểm khi thiếu${capNote}`;
  $('#project-bonus-evidence').innerHTML = projectMatches.map((item) => reportSource(
    `CV · ${item.jd_skill}`, item.project_evidence
  )).join('');

  const methodLabels = { exact: 'Trùng tên', taxonomy_alias: 'Alias', tfidf_cosine: 'TF-IDF cosine', rapidfuzz: 'RapidFuzz', taxonomy_semantic: 'Semantic taxonomy' };
  const skillFound = skillMatches.map((item) => ({
    title: item.jd_skill,
    detail: `CV: ${item.cv_skill} · ${methodLabels[item.match_method] || item.tier} · tin cậy ${formatScore(item.confidence * 100)}`,
    badge: item.priority === 'required' ? 'Bắt buộc' : 'Ưu tiên',
  }));
  const skillMissing = [
    ...missingRequired.map((name) => ({ title: name, detail: 'Chưa tìm thấy kỹ năng CV phù hợp.', badge: 'Bắt buộc' })),
    ...missingPreferred.map((item) => ({ title: item.name, detail: 'Chưa tìm thấy kỹ năng CV phù hợp.', badge: 'Ưu tiên' })),
  ];
  const skillSources = [
    ...skillMatches.flatMap((item) => [
      { label: `JD · ${item.jd_skill}`, text: item.jd_evidence },
      { label: `CV · ${item.cv_skill}`, text: item.match_method === 'tfidf_cosine' || item.match_method === 'rapidfuzz'
        ? `${item.cv_evidence} · cosine ${item.cosine_similarity}` : item.cv_evidence },
    ]),
    ...[...required, ...preferred].filter((item) => !matchedNames.has(item.name))
      .map((item) => ({ label: `JD · chưa khớp ${item.name}`, text: item.evidence })),
  ];

  const expFound = [];
  const expMissing = [];
  if (scores.experience_match.score != null) {
    if (experience.cv_years > 0) expFound.push({ title: `${experience.cv_years.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} năm kinh nghiệm`, detail: 'Được ghi nhận từ phần Experience của CV.' });
    if (scores.experience_match.score < 100) {
      const gap = Math.max((experience.jd_required_years || 0) - (experience.cv_years || 0), 0);
      expMissing.push({ title: `Còn thiếu ${gap.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} năm`, detail: `JD yêu cầu ${experience.jd_required_years} năm kinh nghiệm.` });
    }
  }

  const degreeLabels = { student: 'Sinh viên', bachelor: 'Cử nhân/Đại học', master: 'Thạc sĩ', phd: 'Tiến sĩ' };
  const eduFound = [];
  const eduMissing = [];
  if (education.jd_degree) {
    const item = education.degree_match
      ? { title: `Học vị: ${degreeLabels[education.cv_degree] || education.cv_degree}`, detail: `Đáp ứng yêu cầu ${degreeLabels[education.jd_degree] || education.jd_degree}.` }
      : { title: `Học vị: ${degreeLabels[education.jd_degree] || education.jd_degree}`, detail: `CV: ${degreeLabels[education.cv_degree] || 'chưa xác định'}.` };
    (education.degree_match ? eduFound : eduMissing).push(item);
  }
  if ((education.jd_fields || []).length) {
    const shared = education.jd_fields.filter((field) => (education.cv_fields || []).includes(field));
    const item = education.field_match
      ? { title: `Ngành học: ${shared.join(', ')}`, detail: 'Có trong phần Education của CV.' }
      : { title: `Ngành học: ${education.jd_fields.join(' hoặc ')}`, detail: `CV: ${(education.cv_fields || []).join(', ') || 'chưa xác định'}.` };
    (education.field_match ? eduFound : eduMissing).push(item);
  }

  const otherItems = [
    ...(report.responsibility_matches || []),
    ...(report.other_requirements || []),
  ];

  $('#report-sections').innerHTML = [
    reportSection('report-skills', '01', 'Kỹ năng', 'Đối chiếu yêu cầu bắt buộc và ưu tiên với skill CV.', scores.skill_match, skillFound, skillMissing, skillSources, 'JD không nêu kỹ năng để đối chiếu.'),
    reportSection('report-experience', '02', 'Kinh nghiệm', 'So sánh số năm có bằng chứng trong CV với mức JD yêu cầu.', scores.experience_match, expFound, expMissing, [
      { label: 'JD · số năm yêu cầu', text: experience.jd_text },
      ...(experience.cv_entries || []).map((text) => ({ label: 'CV · kinh nghiệm', text })),
    ], scores.experience_match.reason),
    reportSection('report-education', '03', 'Học vấn', 'Đối chiếu học vị và ngành học.', scores.education_match, eduFound, eduMissing, [
      ...(education.jd_text || []).map((text) => ({ label: 'JD · học vấn', text })),
      ...(education.cv_entries || []).map((text) => ({ label: 'CV · học vấn', text })),
    ], scores.education_match.reason),
    reportEvidenceSection(otherItems),
  ].join('');
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

syncPipeline();
