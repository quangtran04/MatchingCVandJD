const $ = (selector) => document.querySelector(selector);
const selectedFiles = { cv: null, jd: null };
const extractedRawTexts = { cv: "", jd: "" };
const maxFileSize = 10 * 1024 * 1024;
let extractedProfiles = null;
let lastMatchReport = null;
let activeExtractionSource = "cv";
let lastBatchDetailItem = null;
let resultLang = "vi";
let userSelectedLang = false;
const contentTranslations = { vi: new Map(), en: new Map() };
let langRequestSeq = 0;

const RESULT_I18N = {
  vi: {
    locale: "vi-VN",
    // Stage 2: Extraction
    ext_eyebrow: "BƯỚC 02 · HỒ SƠ ĐÃ CẤU TRÚC",
    ext_title: "Thông tin bóc tách từ CV & JD",
    ext_status: "● Sẵn sàng đối chiếu",
    ext_back_input: "← Chỉnh sửa văn bản đầu vào",
    ext_tab_cv: "Hồ sơ ứng viên (CV)",
    ext_tab_jd: "Mô tả công việc (JD)",
    cv_personal_eyebrow: "THÔNG TIN ỨNG VIÊN",
    cv_summary_eyebrow: "TÓM TẮT HỒ SƠ",
    cv_default_name: "Ứng viên",
    cv_no_contact: "Chưa tìm thấy thông tin liên hệ.",
    cv_no_summary: "Chưa có tóm tắt giới thiệu trong hồ sơ.",
    cv_phone: "Điện thoại",
    cv_location: "Địa điểm",
    cv_tech_label: "Công nghệ:",
    cv_skills_title: "Kỹ năng chuyên môn & cá nhân",
    cv_edu_title: "Học vấn",
    cv_exp_title: "Kinh nghiệm làm việc",
    cv_projects_title: "Dự án tiêu biểu",
    cv_lang_title: "Ngoại ngữ",
    cv_cert_title: "Chứng chỉ",
    cv_empty_entry: "Chưa tìm thấy thông tin trong hồ sơ.",
    cv_empty_list: "Chưa tìm thấy thông tin.",
    cv_empty_cert: "Không yêu cầu / Chưa cập nhật",
    cv_empty_exp:
      "Ứng viên chưa liệt kê mục Kinh nghiệm làm việc riêng (thường gặp ở hồ sơ Sinh viên / Thực tập sinh).",
    count_skills: (n) => `${n} kỹ năng`,
    count_projects: (n) => `${n} dự án`,
    count_roles: (n) => (n ? `${n} vị trí` : "Chưa có"),
    count_schools: (n) => `${n} trường`,
    count_tasks: (n) => `${n} nhiệm vụ`,
    count_items: (n) => `${n} mục`,
    jd_info_eyebrow: "THÔNG TIN VỊ TRÍ TUYỂN DỤNG",
    jd_overview_eyebrow: "TỔNG QUAN VAI TRÒ",
    jd_default_title: "Vị trí tuyển dụng",
    jd_no_overview: "Chưa tìm thấy đoạn mô tả tổng quan.",
    jd_level: "Cấp bậc",
    jd_type: "Hình thức",
    jd_dept: "Phòng ban",
    jd_location: "Địa điểm",
    not_specified: "Chưa xác định",
    not_mentioned: "Chưa đề cập",
    not_required: "Không yêu cầu",
    jd_resp_title: "Nhiệm vụ & Trách nhiệm công việc",
    jd_resp_empty: "Chưa tìm thấy danh sách nhiệm vụ.",
    jd_skills_card_title: "Kỹ năng bắt buộc & Công nghệ",
    jd_mandatory_skills: "Kỹ năng bắt buộc",
    jd_tech_tools: "Công nghệ & Công cụ nhận diện",
    jd_exp_title: "Kinh nghiệm yêu cầu",
    jd_edu_card_title: "Học vấn & Chuyên ngành",
    jd_edu_group: "Trình độ học vấn",
    jd_fields_group: "Chuyên ngành liên quan",
    jd_lang_title: "Ngoại ngữ",
    jd_cert_title: "Chứng chỉ",
    jd_pref_title: "Yêu cầu ưu tiên (Điểm cộng & Tư duy)",
    jd_pref_empty: "Không nêu yêu cầu ưu tiên riêng.",
    jd_other_title: "Yêu cầu khác",
    // Stage 3: Match Report
    detail_banner_eyebrow: "XEM CHI TIẾT TỪ BẢNG XẾP HẠNG",
    detail_back_leaderboard: "← Quay lại bảng xếp hạng",
    match_eyebrow: "BÁO CÁO ĐÁNH GIÁ CHI TIẾT",
    match_title: "Mức độ phù hợp giữa CV & JD",
    match_status: "● Đã phân tích",
    match_back_ext: "← Xem lại hồ sơ trích xuất",
    overall_eyebrow: "MỨC ĐỘ PHÙ HỢP TỔNG THỂ",
    overall_title_ok: "Độ tương thích với JD",
    overall_title_na: "Chưa đủ dữ liệu",
    overall_summary: (active, base) =>
      `${active}/4 tiêu chí chính có dữ liệu chấm · Điểm nền ${base}. Kết quả phục vụ hỗ trợ sàng lọc hồ sơ.`,
    bonus_view_evidence: "Xem bằng chứng",
    compare_eyebrow: "ĐỐI CHIẾU CHI TIẾT",
    compare_title: "JD cần gì, CV có bằng chứng gì?",
    compare_desc:
      "Mỗi nhiệm vụ và yêu cầu trong JD đều được truy vết trực tiếp tới phần nội dung tương ứng trong CV.",
    metric_job_fit: "Mô tả công việc",
    metric_skills: "Kỹ năng chuyên môn",
    metric_exp: "Số năm kinh nghiệm",
    metric_edu: "Trình độ học vấn",
    note_tasks: (sup, tot) => (tot ? `${sup}/${tot} nhiệm vụ có bằng chứng` : "JD chưa nêu nhiệm vụ rõ"),
    note_skills: (m, tot) => `${m}/${tot} yêu cầu kỹ năng`,
    note_exp: (yrs) => (yrs == null ? "JD không yêu cầu số năm" : `Yêu cầu ${yrs} năm`),
    note_edu: (hasReq) => (hasReq ? "Đối chiếu học vị & ngành" : "JD không yêu cầu cụ thể"),
    warning_missing: (n, list) =>
      `<span aria-hidden='true'>!</span><p><b>Còn ${n} kỹ năng bắt buộc chưa tìm thấy trong CV:</b> ${list}. Xem chi tiết bên dưới.</p><a href='#report-skills'>Xem kỹ năng →</a>`,
    bonus_cap_note: (earned) => ` · đạt ${earned} điểm nhưng tổng giới hạn 100`,
    bonus_value: (pts) => `+${pts} điểm cộng Dự án`,
    bonus_summary: (n, cap) =>
      `${n} kỹ năng yêu cầu của JD xuất hiện trực tiếp trong phần Dự án thực tế của ứng viên (tối đa +10 điểm)${cap}`,
    na_title: "Tiêu chí không áp dụng tính điểm (N/A)",
    na_short_title: "Tiêu chí không áp dụng (N/A)",
    col_matched: "Đã đáp ứng",
    col_matched_empty: "Chưa ghi nhận mục phù hợp.",
    col_missing: "Chưa khớp / Cần bổ sung",
    col_missing_empty: "Không có mục nào bị thiếu.",
    calc_summary: "Xem cách tính & bằng chứng truy vết",
    calc_weight_line: (w, pts) =>
      `Trọng số áp dụng: <b>${w}</b> · Đóng góp vào điểm nền: <b>${pts} điểm</b>`,
    calc_no_source: "Không có văn bản nguồn cho tiêu chí này.",
    role_title: "Mức độ khớp Mô tả công việc",
    role_subtitle:
      "Từng nhiệm vụ trong JD được đối chiếu trực tiếp với Kinh nghiệm và Dự án của ứng viên.",
    role_formula:
      "Điểm từng nhiệm vụ = 60% kỹ năng liên quan + 30% hành động tương ứng + 10% TF-IDF cosine. Điểm mục này là trung bình cộng các nhiệm vụ.",
    task_strong: "Phù hợp rõ",
    task_partial: "Phù hợp một phần",
    task_unverified: "Chưa có bằng chứng",
    task_related_skills: (pairs) => `Kỹ năng liên quan: ${pairs}`,
    task_shared_actions: "Nội dung và hành động thực hiện có điểm tương đồng.",
    task_no_evidence: "Chưa tìm thấy kinh nghiệm hoặc dự án đủ liên quan trong CV.",
    sec_skills_title: "Kỹ năng chuyên môn & Công nghệ",
    sec_skills_sub:
      "Đối chiếu kỹ năng bắt buộc (trọng số ×2) và kỹ năng ưu tiên (trọng số ×1) giữa JD và CV.",
    sec_skills_empty: "JD không nêu danh sách kỹ năng để đối chiếu.",
    sec_exp_title: "Số năm kinh nghiệm",
    sec_exp_sub:
      "So sánh thời gian làm việc thực tế trong CV với số năm kinh nghiệm tối thiểu JD yêu cầu.",
    sec_edu_title: "Trình độ Học vấn & Chuyên ngành",
    sec_edu_sub: "Đối chiếu cấp bậc đào tạo và chuyên ngành học tập giữa JD và CV.",
    sec_other_title: "Tư duy & Yêu cầu ưu tiên khác",
    sec_other_sub: "Đối chiếu động lực, phương pháp làm việc và điểm cộng với bằng chứng trong CV.",
    sec_other_badge: "Tham khảo · Không trừ điểm",
    sec_other_col_ok: "Có bằng chứng liên quan",
    sec_other_col_ok_empty: "Chưa tìm thấy bằng chứng liên quan.",
    sec_other_col_rev: "Cần xác minh khi phỏng vấn",
    sec_other_col_rev_empty: "Không có mục nào cần xác minh thêm.",
    sec_other_note:
      "Lưu ý: Các tiêu chí thái độ / tư duy chỉ hiển thị bằng chứng tham khảo cho người phỏng vấn, không tự động cộng hay trừ điểm.",
    sec_other_view_full: "Xem bằng chứng đầy đủ",
    sec_other_unverified_detail:
      "CV chưa có bằng chứng định lượng rõ; nên trao đổi thêm khi phỏng vấn.",
    badge_required: "Bắt buộc",
    badge_preferred: "Ưu tiên",
    method_labels: {
      exact: "Trùng khớp chính xác",
      taxonomy_alias: "Từ đồng nghĩa / Alias",
      tfidf_cosine: "TF-IDF Cosine",
      rapidfuzz: "RapidFuzz",
      taxonomy_semantic: "Quan hệ ngữ nghĩa (Taxonomy)",
    },
    skill_found_detail: (cvSkill, method, conf) =>
      `Khớp với CV: ${cvSkill} · ${method} · Độ tin cậy ${conf}`,
    skill_missing_req: "Chưa tìm thấy kỹ năng tương ứng trong CV.",
    skill_missing_pref: "Chưa tìm thấy kỹ năng ưu tiên này trong CV.",
    src_unmatched: (name) => `JD · Chưa khớp (${name})`,
    src_jd_req: "JD · Yêu cầu",
    src_cv_exp: "CV · Kinh nghiệm",
    src_jd_edu: "JD · Học vấn",
    src_cv_edu: "CV · Học vấn",
    exp_years_title: (y) => `${y} năm kinh nghiệm`,
    exp_years_detail: "Được ghi nhận từ phần Kinh nghiệm làm việc của CV.",
    exp_gap_title: (gap) => `Còn thiếu ${gap} năm`,
    exp_gap_detail: (req) => `JD yêu cầu tối thiểu ${req} năm kinh nghiệm.`,
    degree_labels: {
      student: "Sinh viên",
      bachelor: "Cử nhân / Kỹ sư / Đại học",
      master: "Thạc sĩ",
      phd: "Tiến sĩ",
    },
    edu_deg_ok_title: (deg) => `Học vị: ${deg}`,
    edu_deg_ok_detail: (deg) => `Đáp ứng yêu cầu ${deg}.`,
    edu_deg_miss_title: (deg) => `Học vị yêu cầu: ${deg}`,
    edu_deg_miss_detail: (deg) => `CV hiện tại: ${deg}.`,
    edu_field_ok_title: (f) => `Ngành học: ${f}`,
    edu_field_ok_detail: "Khớp với thông tin Học vấn trong CV.",
    edu_field_miss_title: (f) => `Ngành học yêu cầu: ${f}`,
    edu_field_miss_detail: (f) => `CV hiện tại: ${f}.`,
    or_word: " hoặc ",
    // Batch Mode Results
    batch_eyebrow: "KẾT QUẢ XẾP HẠNG ĐA ỨNG VIÊN",
    batch_title: (n, jdTitle) => `Xếp hạng ${n} ứng viên — ${jdTitle}`,
    batch_export_csv: "↓ Xuất bảng CSV",
    batch_edit_inputs: "← Thay đổi JD / Cấu hình",
    batch_search_ph: "Tìm ứng viên theo tên, tên tệp hoặc kỹ năng thiếu…",
    filter_all: "Tất cả",
    filter_vi: "Tiếng Việt",
    filter_en: "Tiếng Anh",
    filter_bi: "Song ngữ",
    sort_label: "Sắp xếp theo:",
    sort_overall: "Điểm tổng (Đề xuất)",
    sort_skill: "Kỹ năng chuyên môn",
    sort_job_fit: "Mô tả công việc",
    sort_exp: "Số năm kinh nghiệm",
    sort_base_kw: "Baseline Từ khóa thuần",
    sort_base_tfidf: "Baseline TF-IDF toàn văn",
    sort_base_sbert: "Baseline SBERT đa ngôn ngữ",
    th_rank: "Hạng",
    th_candidate: "Ứng viên & Tệp CV",
    th_overall: "Tổng điểm",
    th_job_fit: "Mô tả CV",
    th_skills: "Kỹ năng",
    th_exp: "Kinh nghiệm",
    th_edu: "Học vấn",
    th_bonus: "Thưởng DA",
    th_missing: "Thiếu bắt buộc",
    th_detail: "Chi tiết",
    stat_top_label: "ỨNG VIÊN HẠNG #1",
    stat_total_label: "TỔNG SỐ HỒ SƠ ĐÃ CHẤM",
    stat_avg_label: "ĐIỂM TRUNG BÌNH / TRUNG VỊ",
    stat_median: (val) => `Trung vị: ${val}`,
    stat_qual_label: "ỨNG VIÊN ĐẠT ≥ 70%",
    stat_qual_note: "Gợi ý ưu tiên mời phỏng vấn",
    batch_empty_filter: "Không có ứng viên nào khớp bộ lọc hiện tại.",
    batch_all_met: "Đủ bắt buộc",
    batch_inspect: "Xem chi tiết →",
    detail_banner_title: (rank, name, file, score) =>
      `Hạng #${rank} — ${name} (${file}) · Tổng điểm ${score}`,
  },
  en: {
    locale: "en-US",
    // Stage 2: Extraction
    ext_eyebrow: "STEP 02 · STRUCTURED PROFILES",
    ext_title: "Extracted CV & JD Information",
    ext_status: "● Ready for matching",
    ext_back_input: "← Edit input text",
    ext_tab_cv: "Candidate Profile (CV)",
    ext_tab_jd: "Job Description (JD)",
    cv_personal_eyebrow: "PERSONAL INFO",
    cv_summary_eyebrow: "PROFILE SUMMARY",
    cv_default_name: "Candidate",
    cv_no_contact: "No contact information found.",
    cv_no_summary: "No profile summary found in CV.",
    cv_phone: "Phone",
    cv_location: "Location",
    cv_tech_label: "Technologies:",
    cv_skills_title: "Technical & Soft Skills",
    cv_edu_title: "Education",
    cv_exp_title: "Work Experience",
    cv_projects_title: "Featured Projects",
    cv_lang_title: "Languages",
    cv_cert_title: "Certificates",
    cv_empty_entry: "No information found in profile.",
    cv_empty_list: "No information found.",
    cv_empty_cert: "Not required / Not provided",
    cv_empty_exp:
      "No separate Work Experience section listed (common for Student / Intern profiles).",
    count_skills: (n) => `${n} skill${n === 1 ? "" : "s"}`,
    count_projects: (n) => `${n} project${n === 1 ? "" : "s"}`,
    count_roles: (n) => (n ? `${n} role${n === 1 ? "" : "s"}` : "None"),
    count_schools: (n) => `${n} school${n === 1 ? "" : "s"}`,
    count_tasks: (n) => `${n} task${n === 1 ? "" : "s"}`,
    count_items: (n) => `${n} item${n === 1 ? "" : "s"}`,
    jd_info_eyebrow: "JOB INFORMATION",
    jd_overview_eyebrow: "ROLE OVERVIEW",
    jd_default_title: "Job Position",
    jd_no_overview: "No role overview paragraph found.",
    jd_level: "Level",
    jd_type: "Type",
    jd_dept: "Department",
    jd_location: "Location",
    not_specified: "Not specified",
    not_mentioned: "Not mentioned",
    not_required: "Not required",
    jd_resp_title: "Responsibilities & Duties",
    jd_resp_empty: "No responsibilities list found.",
    jd_skills_card_title: "Mandatory Skills & Technologies",
    jd_mandatory_skills: "Mandatory Skills",
    jd_tech_tools: "Detected Technologies & Tools",
    jd_exp_title: "Experience Requirements",
    jd_edu_card_title: "Education & Fields of Study",
    jd_edu_group: "Education Level",
    jd_fields_group: "Related Fields of Study",
    jd_lang_title: "Languages",
    jd_cert_title: "Certificates",
    jd_pref_title: "Preferred Requirements (Bonus & Mindset)",
    jd_pref_empty: "No specific preferred requirements listed.",
    jd_other_title: "Other Requirements",
    // Stage 3: Match Report
    detail_banner_eyebrow: "DETAIL VIEW FROM LEADERBOARD",
    detail_back_leaderboard: "← Back to leaderboard",
    match_eyebrow: "EXPLAINABLE EVALUATION REPORT",
    match_title: "CV & JD Compatibility Analysis",
    match_status: "● Analyzed",
    match_back_ext: "← Review extracted profiles",
    overall_eyebrow: "OVERALL COMPATIBILITY",
    overall_title_ok: "Compatibility with JD",
    overall_title_na: "Insufficient data",
    overall_summary: (active, base) =>
      `${active}/4 core criteria scored · Base score ${base}. Results assist candidate screening.`,
    bonus_view_evidence: "View evidence",
    compare_eyebrow: "DETAILED COMPARISON",
    compare_title: "What does the JD require vs. CV evidence?",
    compare_desc:
      "Every JD responsibility and requirement is traced directly to its corresponding evidence in the CV.",
    metric_job_fit: "Job Description Fit",
    metric_skills: "Technical Skills",
    metric_exp: "Years of Experience",
    metric_edu: "Education Level",
    note_tasks: (sup, tot) =>
      tot ? `${sup}/${tot} tasks backed by evidence` : "No clear responsibilities in JD",
    note_skills: (m, tot) => `${m}/${tot} skill requirements`,
    note_exp: (yrs) => (yrs == null ? "No minimum years required" : `Requires ${yrs} year(s)`),
    note_edu: (hasReq) => (hasReq ? "Degree & major comparison" : "No specific requirement in JD"),
    warning_missing: (n, list) =>
      `<span aria-hidden='true'>!</span><p><b>${n} required skill(s) not found in CV:</b> ${list}. See details below.</p><a href='#report-skills'>View skills →</a>`,
    bonus_cap_note: (earned) => ` · earned ${earned} pts but total capped at 100`,
    bonus_value: (pts) => `+${pts} Project Bonus pts`,
    bonus_summary: (n, cap) =>
      `${n} JD required skill(s) found directly in candidate Projects (max +10 pts)${cap}`,
    na_title: "Criterion not applicable (N/A)",
    na_short_title: "Criterion not applicable (N/A)",
    col_matched: "Matched",
    col_matched_empty: "No matching items recorded.",
    col_missing: "Missing / Needs Improvement",
    col_missing_empty: "No missing items.",
    calc_summary: "View calculation & traceable evidence",
    calc_weight_line: (w, pts) =>
      `Effective weight: <b>${w}</b> · Contribution to base score: <b>${pts} pts</b>`,
    calc_no_source: "No source text available for this criterion.",
    role_title: "Job Description Alignment",
    role_subtitle:
      "Each JD responsibility is matched directly against the candidate's Experience and Projects.",
    role_formula:
      "Per-task score = 60% related skills + 30% matching actions + 10% TF-IDF cosine. Section score is the average across tasks.",
    task_strong: "Strong match",
    task_partial: "Partial match",
    task_unverified: "No evidence",
    task_related_skills: (pairs) => `Related skills: ${pairs}`,
    task_shared_actions: "Similar content and execution actions detected.",
    task_no_evidence: "No sufficiently relevant experience or project found in CV.",
    sec_skills_title: "Technical Skills & Technologies",
    sec_skills_sub:
      "Compares mandatory skills (weight ×2) and preferred skills (weight ×1) between JD and CV.",
    sec_skills_empty: "JD does not specify a skills list for matching.",
    sec_exp_title: "Years of Experience",
    sec_exp_sub:
      "Compares actual work duration in CV against minimum years required by JD.",
    sec_edu_title: "Education & Field of Study",
    sec_edu_sub: "Compares degree level and academic major between JD and CV.",
    sec_other_title: "Mindset & Other Preferred Criteria",
    sec_other_sub: "Matches motivation, work style, and bonus points against CV evidence.",
    sec_other_badge: "Reference · No penalty",
    sec_other_col_ok: "Supporting evidence",
    sec_other_col_ok_empty: "No supporting evidence found.",
    sec_other_col_rev: "Verify in interview",
    sec_other_col_rev_empty: "No items require further verification.",
    sec_other_note:
      "Note: Attitude/mindset criteria are displayed as reference evidence for interviewers and do not add or deduct points.",
    sec_other_view_full: "View full evidence",
    sec_other_unverified_detail:
      "No clear quantitative evidence in CV; recommended to discuss during interview.",
    badge_required: "Required",
    badge_preferred: "Preferred",
    method_labels: {
      exact: "Exact match",
      taxonomy_alias: "Alias / Synonym",
      tfidf_cosine: "TF-IDF Cosine",
      rapidfuzz: "RapidFuzz",
      taxonomy_semantic: "Semantic (Taxonomy)",
    },
    skill_found_detail: (cvSkill, method, conf) =>
      `Matched CV: ${cvSkill} · ${method} · Confidence ${conf}`,
    skill_missing_req: "No corresponding skill found in CV.",
    skill_missing_pref: "Preferred skill not found in CV.",
    src_unmatched: (name) => `JD · Unmatched (${name})`,
    src_jd_req: "JD · Requirement",
    src_cv_exp: "CV · Experience",
    src_jd_edu: "JD · Education",
    src_cv_edu: "CV · Education",
    exp_years_title: (y) => `${y} year(s) of experience`,
    exp_years_detail: "Extracted from the Work Experience section of CV.",
    exp_gap_title: (gap) => `Short by ${gap} year(s)`,
    exp_gap_detail: (req) => `JD requires at least ${req} year(s) of experience.`,
    degree_labels: {
      student: "Student / Undergraduate",
      bachelor: "Bachelor / Engineer",
      master: "Master",
      phd: "PhD / Doctorate",
    },
    edu_deg_ok_title: (deg) => `Degree: ${deg}`,
    edu_deg_ok_detail: (deg) => `Meets requirement (${deg}).`,
    edu_deg_miss_title: (deg) => `Required degree: ${deg}`,
    edu_deg_miss_detail: (deg) => `Current CV: ${deg}.`,
    edu_field_ok_title: (f) => `Major: ${f}`,
    edu_field_ok_detail: "Matches Education info in CV.",
    edu_field_miss_title: (f) => `Required major: ${f}`,
    edu_field_miss_detail: (f) => `Current CV: ${f}.`,
    or_word: " or ",
    // Batch Mode Results
    batch_eyebrow: "MULTI-CANDIDATE RANKING RESULTS",
    batch_title: (n, jdTitle) => `Ranking ${n} candidate${n === 1 ? "" : "s"} — ${jdTitle}`,
    batch_export_csv: "↓ Export CSV",
    batch_edit_inputs: "← Edit JD / Config",
    batch_search_ph: "Search candidate by name, filename, or missing skill…",
    filter_all: "All",
    filter_vi: "Vietnamese",
    filter_en: "English",
    filter_bi: "Bilingual",
    sort_label: "Sort by:",
    sort_overall: "Overall Score (Proposed)",
    sort_skill: "Technical Skills",
    sort_job_fit: "Job Description Fit",
    sort_exp: "Years of Experience",
    sort_base_kw: "Keyword Baseline",
    sort_base_tfidf: "Full-text TF-IDF Baseline",
    sort_base_sbert: "Multilingual SBERT Baseline",
    th_rank: "Rank",
    th_candidate: "Candidate & CV File",
    th_overall: "Overall",
    th_job_fit: "Job Fit",
    th_skills: "Skills",
    th_exp: "Experience",
    th_edu: "Education",
    th_bonus: "Proj Bonus",
    th_missing: "Missing Required",
    th_detail: "Details",
    stat_top_label: "#1 TOP CANDIDATE",
    stat_total_label: "TOTAL EVALUATED CVS",
    stat_avg_label: "AVERAGE / MEDIAN SCORE",
    stat_median: (val) => `Median: ${val}`,
    stat_qual_label: "CANDIDATES ≥ 70%",
    stat_qual_note: "Recommended for interview",
    batch_empty_filter: "No candidates match the current filter.",
    batch_all_met: "All required met",
    batch_inspect: "View details →",
    detail_banner_title: (rank, name, file, score) =>
      `Rank #${rank} — ${name} (${file}) · Overall ${score}`,
  },
};

function t() {
  return RESULT_I18N[resultLang] || RESULT_I18N.vi;
}

function fmtNum(value, maxFrac = 1) {
  return Number(value).toLocaleString(t().locale, { maximumFractionDigits: maxFrac });
}

function translateReason(reason) {
  if (!reason || resultLang !== "en") return reason || "";
  const text = String(reason);
  let m = text.match(/^(\d+)\s+nhiệm vụ JD có trọng số ngang nhau;/);
  if (m) {
    return `${m[1]} JD responsibilities weighted equally; matched by skills, actions, and TF-IDF cosine against CV Experience/Projects.`;
  }
  if (text.includes("JD không có nhiệm vụ công việc đủ rõ")) {
    return "JD has no clear job responsibilities to match; criterion is N/A.";
  }
  m = text.match(/^(\d+)\s+yêu cầu kỹ năng bắt buộc × 2;\s*(\d+)\s+yêu cầu ưu tiên × 1\./);
  if (m) {
    return `${m[1]} mandatory skill requirement(s) × 2; ${m[2]} preferred requirement(s) × 1. Exact = 100%; alias = 95%; TF-IDF cosine/RapidFuzz by similarity; taxonomy semantic = 80%.`;
  }
  if (text.includes("JD không nêu kỹ năng để chấm")) {
    return "JD does not specify skills for scoring.";
  }
  if (text.includes("JD không nêu số năm kinh nghiệm")) {
    return "JD does not specify required years of experience; criterion is N/A.";
  }
  if (text.includes("CV có kinh nghiệm nhưng không đủ ngày")) {
    return "CV mentions experience without enough dates or years to quantify; criterion is N/A.";
  }
  if (text.includes("JD không có yêu cầu học vị/ngành học")) {
    return "JD has no matchable degree or major requirements; criterion is N/A.";
  }
  m = text.match(/^Học vị JD:\s*(.+?);\s*CV:\s*(.+?)\.\s*Ngành JD:\s*(.+?);\s*CV:\s*(.+?)\.$/);
  if (m) {
    const mapVal = (v) =>
      v === "không yêu cầu" ? "not required" : v === "không xác định" ? "not specified" : v;
    return `JD Degree: ${mapVal(m[1])}; CV: ${mapVal(m[2])}. JD Major: ${mapVal(m[3])}; CV: ${mapVal(m[4])}.`;
  }
  return text;
}

const VN_ACCENT_RE =
  /[ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸàáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/;

function hasViAccents(str) {
  return VN_ACCENT_RE.test(String(str || ""));
}

function isLikelyEnOnly(str) {
  const s = String(str || "").trim();
  return /[A-Za-z]/.test(s) && !hasViAccents(s);
}

function pickFromSlashPair(segment, lang) {
  const parts = segment.split(" / ");
  if (parts.length !== 2) return segment;
  const left = parts[0].trim();
  const right = parts[1].trim();
  if (!left || !right) return segment;
  const leftVi = hasViAccents(left);
  const rightVi = hasViAccents(right);
  const leftEn = isLikelyEnOnly(left);
  const rightEn = isLikelyEnOnly(right);
  if (leftVi && rightEn) return lang === "vi" ? left : right;
  if (leftEn && rightVi) return lang === "vi" ? right : left;
  return segment;
}

function pickBilingualText(value, lang = resultLang) {
  if (value == null) return "";
  const str = String(value);
  if (!str.includes(" / ")) return str;

  // Check whole-string bilingual pair first (e.g. "Dự án cá nhân: ... / Personal project: ...")
  const wholeParts = str.split(" / ");
  if (wholeParts.length === 2) {
    const [a, b] = wholeParts.map((s) => s.trim());
    const balancedColon = a.includes(":") === b.includes(":");
    const hasAsymSep =
      /(?: — | @ | - )/.test(a) !== /(?: — | @ | - )/.test(b);
    if (balancedColon && !hasAsymSep) {
      const picked = pickFromSlashPair(str, lang);
      if (picked !== str) return picked;
    }
  }

  // Otherwise resolve clause-by-clause while preserving delimiters
  // Only split on ". " for real sentence boundaries (avoid splitting "B.Eng. in ...", "TP. HCM")
  return str
    .split(/( — | @ |: |, | - |(?<!\b(?:TP|B\.Eng|B\.Sc|M\.Eng|M\.Sc|Ph\.D|Mr|Ms|Dr))\. (?=[A-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠ-Ỹ0-9]))/)
    .map((chunk) => (chunk.includes(" / ") ? pickFromSlashPair(chunk, lang) : chunk))
    .join("");
}

function filterBilingualList(values, lang = resultLang) {
  if (!Array.isArray(values) || !values.length) return [];
  const cleaned = values.map((v) => pickBilingualText(v, lang));
  if (cleaned.length < 2) return cleaned;

  const isViItem = (s) => hasViAccents(s);
  const isEnSentence = (s) => isLikelyEnOnly(s) && s.trim().split(/\s+/).length >= 3;

  const hasVi = cleaned.some(isViItem);
  const hasEn = cleaned.some(isEnSentence);
  if (hasVi && hasEn) {
    const filtered =
      lang === "vi"
        ? cleaned.filter((s) => !isEnSentence(s))
        : cleaned.filter((s) => !isViItem(s));
    if (filtered.length) return filtered;
  }
  return cleaned;
}

function tr(value) {
  if (value == null) return "";
  const str = pickBilingualText(String(value), resultLang);
  if (!str.trim()) return str;
  return contentTranslations[resultLang]?.get(str) ?? str;
}

function collectCvTexts(profile, lang = resultLang) {
  if (!profile) return [];
  const texts = [];
  const add = (v) => {
    if (v) texts.push(pickBilingualText(v, lang));
  };
  const info = profile.personal_info || {};
  add(info.headline);
  add(info.location);
  add(profile.summary);
  (profile.skills || []).forEach(add);
  filterBilingualList(profile.languages || [], lang).forEach(add);
  filterBilingualList(profile.certificates || [], lang).forEach(add);
  ["education", "experience", "projects"].forEach((key) => {
    (profile[key] || []).forEach((entry) => {
      add(entry?.title);
      add(entry?.details);
    });
  });
  return texts;
}

function collectJdTexts(profile, lang = resultLang) {
  if (!profile) return [];
  const texts = [];
  const add = (v) => {
    if (v) texts.push(pickBilingualText(v, lang));
  };
  const job = profile.job_info || {};
  const desc = profile.job_description || {};
  const req = profile.requirements || {};
  [job.title, job.department, job.location, job.level, job.employment_type, desc.description].forEach(
    add
  );
  [
    ...filterBilingualList(desc.responsibilities || [], lang),
    ...filterBilingualList(req.mandatory_skills || [], lang),
    ...filterBilingualList(req.experience || [], lang),
    ...filterBilingualList(req.education || [], lang),
    ...filterBilingualList(req.fields_of_study || [], lang),
    ...filterBilingualList(req.languages || [], lang),
    ...filterBilingualList(req.certificates || [], lang),
    ...filterBilingualList(req.other_requirements || [], lang),
    ...filterBilingualList(profile.preferred_requirements || [], lang),
  ].forEach(add);
  return texts;
}

function collectMatchTexts(report, lang = resultLang) {
  if (!report) return [];
  const texts = [];
  const add = (v) => {
    if (v) texts.push(pickBilingualText(v, lang));
  };
  (report.responsibility_matches || []).forEach((item) => {
    add(item.jd_text);
    add(item.cv_section);
    add(item.cv_evidence);
  });
  (report.matched_skills || []).forEach((item) => {
    add(item.jd_evidence);
    add(item.cv_evidence);
  });
  const skillEv = report.scores?.skill_match?.evidence || {};
  [...(skillEv.required || []), ...(skillEv.preferred || [])].forEach((item) => {
    add(item?.evidence);
  });
  const expEv = report.scores?.experience_match?.evidence || {};
  add(expEv.jd_text);
  (expEv.cv_entries || []).forEach(add);
  const eduEv = report.scores?.education_match?.evidence || {};
  [
    ...(eduEv.jd_text || []),
    ...(eduEv.cv_entries || []),
    ...(eduEv.jd_fields || []),
    ...(eduEv.cv_fields || []),
  ].forEach(add);
  (report.project_matches || []).forEach((item) => {
    add(item.project_evidence);
  });
  (report.other_requirements || []).forEach((item) => {
    add(item.jd_text);
    add(item.cv_section);
    add(item.cv_evidence);
  });
  return texts;
}

function collectBatchTexts(data, lang = resultLang) {
  if (!data) return [];
  const texts = [];
  const jdTitle = data.jd_profile?.job_info?.title;
  if (jdTitle) texts.push(pickBilingualText(jdTitle, lang));
  return texts;
}

async function ensureTranslated(texts, lang) {
  const cache = contentTranslations[lang];
  if (!cache) return;
  const uncached = [];
  const seen = new Set();
  for (const raw of texts) {
    if (typeof raw !== "string") continue;
    if (!raw.trim() || seen.has(raw) || cache.has(raw)) continue;
    seen.add(raw);
    uncached.push(raw);
  }
  if (!uncached.length) return;

  const batchSize = 350;
  for (let i = 0; i < uncached.length; i += batchSize) {
    const slice = uncached.slice(i, i + batchSize);
    try {
      const res = await fetch("/api/translate-texts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_lang: lang, texts: slice }),
      });
      if (!res.ok) continue;
      const body = await res.json();
      const map = body.translations || {};
      Object.entries(map).forEach(([orig, translated]) => {
        cache.set(orig, translated);
      });
    } catch {
      // Graceful fallback: keep original strings if network fails
    }
  }
}

function setLangSwitchLoading(loading, targetLang) {
  document.querySelectorAll(".lang-switch-btn").forEach((btn) => {
    const btnLang = btn.dataset.resultLang;
    btn.disabled = loading;
    if (loading && btnLang === targetLang) {
      btn.textContent = `◌ ${btnLang.toUpperCase()}`;
    } else {
      btn.textContent = btnLang.toUpperCase();
    }
  });
}

function localizeFieldValue(value) {
  if (!value) return t().not_specified;
  if (resultLang === "en") {
    if (value === "Chưa xác định") return t().not_specified;
    if (value === "Không yêu cầu") return t().not_required;
    if (value === "Không có") return "None";
  }
  return tr(value);
}

function applyStaticResultI18n() {
  const dict = t();
  document.querySelectorAll("[data-res-i18n]").forEach((el) => {
    const key = el.getAttribute("data-res-i18n");
    if (key && typeof dict[key] === "string") {
      el.textContent = dict[key];
    }
  });
  const searchInput = $("#batch-search-input");
  if (searchInput) searchInput.placeholder = dict.batch_search_ph;

  document.querySelectorAll(".lang-switch-btn").forEach((btn) => {
    const isActive = btn.dataset.resultLang === resultLang;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

function rerenderActiveResults() {
  if (extractedProfiles) {
    if (activeExtractionSource === "cv") renderProfile(extractedProfiles.cv_profile);
    else renderJobProfile(extractedProfiles.jd_profile);
  }
  if (lastMatchReport) {
    renderMatch(lastMatchReport);
  }
  if (lastBatchResponse) {
    renderBatchDashboard(lastBatchResponse, false);
  }
  if (viewingBatchDetail && lastBatchDetailItem) {
    const item = lastBatchDetailItem;
    if ($("#batch-detail-candidate-title")) {
      $("#batch-detail-candidate-title").textContent = t().detail_banner_title(
        item.rank,
        item.candidate_name,
        item.filename,
        formatScore(item.overall_score)
      );
    }
  }
}

async function setResultLang(lang) {
  if (lang !== "vi" && lang !== "en") return;
  const reqId = ++langRequestSeq;
  resultLang = lang;
  userSelectedLang = true;
  applyStaticResultI18n();
  rerenderActiveResults();

  const textsToTranslate = [
    ...(extractedProfiles ? collectCvTexts(extractedProfiles.cv_profile, lang) : []),
    ...(extractedProfiles ? collectJdTexts(extractedProfiles.jd_profile, lang) : []),
    ...(lastMatchReport ? collectMatchTexts(lastMatchReport, lang) : []),
    ...(lastBatchResponse ? collectBatchTexts(lastBatchResponse, lang) : []),
  ];
  if (!textsToTranslate.length) return;

  setLangSwitchLoading(true, lang);
  try {
    await ensureTranslated(textsToTranslate, lang);
  } finally {
    if (reqId === langRequestSeq) {
      setLangSwitchLoading(false, lang);
      rerenderActiveResults();
    }
  }
}

document.querySelectorAll(".lang-switch-btn").forEach((btn) => {
  btn.addEventListener("click", () => setResultLang(btn.dataset.resultLang));
});

function updateCount(kind) {
  const node = $(`#${kind}-text`);
  if (!node) return;
  const countNode = $(`#${kind}-count`);
  if (!countNode) return;

  if (node.value.length > 0) {
    countNode.textContent = `${node.value.length.toLocaleString("vi-VN")} ký tự`;
  } else if (extractedRawTexts[kind].length > 0) {
    countNode.textContent = `Đã nạp từ tệp (${extractedRawTexts[kind].length.toLocaleString("vi-VN")} ký tự)`;
  } else {
    countNode.textContent = "0 ký tự";
  }
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

  updateCount(kind);
  showFileMessage(
    kind,
    `✓ Đã trích xuất: ${file.name}${body.method ? ` · ${body.method}` : ""}`
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
    .split(
      /(?=(?:Mô tả|Công việc thực hiện|Trách nhiệm|Chuyên ngành|Description|Responsibilities|Tasks|Major)\s*:)/i
    )
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
        <span class="entry-tech-label">${escapeHtml(t().cv_tech_label)}</span>
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

function renderEntries(entries, emptyText = t().cv_empty_entry) {
  if (!entries?.length) {
    return `<div class="empty-state-box"><span>—</span><p class="empty-value">${escapeHtml(emptyText)}</p></div>`;
  }
  return `<div class="field-list">${entries
    .map((entry, idx) => {
      const rawTitle = String(tr(entry.title || "")).trim();
      const titleParts = rawTitle.split(/\s*\|\s*/).filter(Boolean);
      const mainTitle = titleParts[0] || rawTitle;
      const metaBadges = titleParts.slice(1);

      return `<div class="field-entry">
        <div class="field-entry-top">
          <div class="field-entry-heading">
            <span class="entry-index">${String(idx + 1).padStart(2, "0")}</span>
            <b>${escapeHtml(mainTitle)}</b>
          </div>
          ${entry.date ? `<time>${escapeHtml(pickBilingualText(entry.date, resultLang))}</time>` : ""}
        </div>
        ${
          metaBadges.length
            ? `<div class="entry-meta-pills">${metaBadges
                .map((badge) => `<span class="entry-meta-pill">${escapeHtml(badge)}</span>`)
                .join("")}</div>`
            : ""
        }
        <div class="field-entry-content">
          ${formatEntryDetails(tr(entry.details))}
        </div>
      </div>`;
    })
    .join("")}</div>`;
}

function renderList(values, tags = false, emptyText = t().cv_empty_list, numbered = false) {
  const displayValues = filterBilingualList(values || [], resultLang);
  if (!displayValues.length) {
    return `<div class="empty-state-box compact"><span>—</span><p class="empty-value">${escapeHtml(emptyText)}</p></div>`;
  }
  if (tags) {
    return `<div class="tag-list">${displayValues.map((value) => `<span>${escapeHtml(localizeFieldValue(value))}</span>`).join("")}</div>`;
  }
  return `<div class="field-list compact-list">${displayValues
    .map(
      (value, idx) =>
        `<div class="field-bullet-item">
          <span class="bullet-dot">${numbered ? String(idx + 1).padStart(2, "0") : "•"}</span>
          <p class="field-text">${escapeHtml(localizeFieldValue(value))}</p>
        </div>`
    )
    .join("")}</div>`;
}

function renderProfile(profile) {
  const dict = t();
  const info = profile.personal_info || {};
  const name = info.name || dict.cv_default_name;
  const headline = info.headline ? tr(info.headline) : "";
  const contactItems = [
    info.email ? { icon: "✉", label: "Email", value: info.email } : null,
    info.phone ? { icon: "☎", label: dict.cv_phone, value: info.phone } : null,
    info.location ? { icon: "⌖", label: dict.cv_location, value: tr(info.location) } : null,
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
          <p class="mini-label">${escapeHtml(dict.cv_personal_eyebrow)}</p>
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
              : `<p class="empty-value">${escapeHtml(dict.cv_no_contact)}</p>`
          }
        </div>
      </div>
    </div>
    <div class="profile-summary-box">
      <p class="mini-label">${escapeHtml(dict.cv_summary_eyebrow)}</p>
      ${
        profile.summary
          ? `<p class="profile-summary-text">${escapeHtml(tr(profile.summary))}</p>`
          : `<p class="empty-value">${escapeHtml(dict.cv_no_summary)}</p>`
      }
    </div>
  </article>`;

  const skillsCount = profile.skills?.length ? dict.count_skills(profile.skills.length) : "";
  const projectsCount = profile.projects?.length ? dict.count_projects(profile.projects.length) : "";
  const expCount = dict.count_roles(profile.experience?.length || 0);
  const eduCount = profile.education?.length ? dict.count_schools(profile.education.length) : "";

  const container = $("#extraction-fields");
  if (!container) return;

  container.innerHTML = `
    ${candidateHero}
    <div class="cv-balanced-grid">
      ${fieldCard("SKILLS", dict.cv_skills_title, renderList(profile.skills, true), "", skillsCount)}
      ${fieldCard("EDUCATION", dict.cv_edu_title, renderEntries(profile.education), "", eduCount)}
      ${fieldCard(
        "EXPERIENCE",
        dict.cv_exp_title,
        renderEntries(profile.experience, dict.cv_empty_exp),
        "",
        expCount
      )}
      ${fieldCard("PROJECTS", dict.cv_projects_title, renderEntries(profile.projects), "", projectsCount)}
      ${fieldCard("LANGUAGES", dict.cv_lang_title, renderList(profile.languages))}
      ${fieldCard("CERTIFICATES", dict.cv_cert_title, renderList(profile.certificates, false, dict.cv_empty_cert))}
    </div>
  `;
}

function requirementGroup(label, values, tags = false, emptyText = t().not_mentioned) {
  const displayValues = filterBilingualList(values || [], resultLang);
  return `<div class="req-group-card">
    <div class="req-group-header">
      <b>${escapeHtml(label)}</b>
      ${displayValues.length ? `<span class="req-group-count">${displayValues.length}</span>` : ""}
    </div>
    ${renderList(displayValues, tags, emptyText)}
  </div>`;
}

function renderJobProfile(profile) {
  const dict = t();
  const job = profile.job_info || {};
  const description = profile.job_description || {};
  const requirements = profile.requirements || {};

  const jobMeta = [
    { label: dict.jd_level, value: localizeFieldValue(job.level), wide: false },
    { label: dict.jd_type, value: localizeFieldValue(job.employment_type), wide: false },
    { label: dict.jd_dept, value: localizeFieldValue(job.department), wide: false },
    { label: dict.jd_location, value: localizeFieldValue(job.location), wide: true },
  ];

  const jdHero = `<article class="profile-hero-card jd-hero-card">
    <div class="profile-hero-top">
      <div class="profile-identity">
        <div class="profile-avatar jd-avatar">JD</div>
        <div class="profile-identity-text">
          <p class="mini-label">${escapeHtml(dict.jd_info_eyebrow)}</p>
          <div class="profile-name-row">
            <h3>${escapeHtml(job.title ? tr(job.title) : dict.jd_default_title)}</h3>
            ${job.level ? `<span class="profile-headline-badge jd-badge">${escapeHtml(tr(job.level))}</span>` : ""}
          </div>
          <div class="jd-meta-grid">
            ${jobMeta
              .map(
                (item) => `<div class="jd-meta-item${item.wide ? " jd-meta-item-location" : ""}">
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
      <p class="mini-label">${escapeHtml(dict.jd_overview_eyebrow)}</p>
      ${
        description.description
          ? `<p class="profile-summary-text">${escapeHtml(tr(description.description))}</p>`
          : `<p class="empty-value">${escapeHtml(dict.jd_no_overview)}</p>`
      }
    </div>
  </article>`;

  const respList = filterBilingualList(description.responsibilities || [], resultLang);
  const prefList = filterBilingualList(profile.preferred_requirements || [], resultLang);
  const mandList = filterBilingualList(requirements.mandatory_skills || [], resultLang);
  const expList = filterBilingualList(requirements.experience || [], resultLang);
  const langList = filterBilingualList(requirements.languages || [], resultLang);
  const otherList = filterBilingualList(requirements.other_requirements || [], resultLang);

  const respCount = respList.length ? dict.count_tasks(respList.length) : "";
  const prefCount = prefList.length ? dict.count_items(prefList.length) : "";
  const skillsTotal = mandList.length + (requirements.technologies_tools?.length || 0);
  const skillsBadge = skillsTotal ? dict.count_items(skillsTotal) : "";
  const expBadge = expList.length ? dict.count_items(expList.length) : "";
  const langBadge = langList.length ? dict.count_items(langList.length) : "";
  const otherBadge = otherList.length ? dict.count_items(otherList.length) : "";

  const skillsTechBody = `<div class="req-groups-grid">
    ${requirementGroup(dict.jd_mandatory_skills, requirements.mandatory_skills)}
    ${requirementGroup(dict.jd_tech_tools, requirements.technologies_tools, true)}
  </div>`;

  const eduFieldsBody = `<div class="req-groups-grid">
    ${requirementGroup(dict.jd_edu_group, requirements.education)}
    ${requirementGroup(dict.jd_fields_group, requirements.fields_of_study, true)}
  </div>`;

  const container = $("#extraction-fields");
  if (!container) return;

  container.innerHTML = `
    ${jdHero}
    <div class="jd-balanced-grid">
      ${fieldCard(
        "RESPONSIBILITIES",
        dict.jd_resp_title,
        renderList(description.responsibilities, false, dict.jd_resp_empty, true),
        "",
        respCount
      )}
      ${fieldCard("SKILLS & TECH", dict.jd_skills_card_title, skillsTechBody, "", skillsBadge)}
      ${fieldCard(
        "EXPERIENCE",
        dict.jd_exp_title,
        renderList(requirements.experience, false, dict.not_mentioned),
        "",
        expBadge
      )}
      ${fieldCard("EDUCATION", dict.jd_edu_card_title, eduFieldsBody)}
      ${fieldCard(
        "LANGUAGES",
        dict.jd_lang_title,
        renderList(requirements.languages, false, dict.not_mentioned),
        "",
        langBadge
      )}
      ${fieldCard(
        "CERTIFICATES",
        dict.jd_cert_title,
        renderList(requirements.certificates, false, dict.not_required)
      )}
      ${fieldCard(
        "PREFERRED REQUIREMENTS",
        dict.jd_pref_title,
        renderList(profile.preferred_requirements, false, dict.jd_pref_empty),
        "",
        prefCount
      )}
      ${fieldCard(
        "OTHER REQUIREMENTS",
        dict.jd_other_title,
        renderList(requirements.other_requirements, false, dict.not_mentioned),
        "",
        otherBadge
      )}
    </div>
  `;
}

function formatScore(value) {
  return value == null ? "N/A" : `${fmtNum(value, 1)}%`;
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
  const dict = t();
  const score = metric.score;
  const sourceList = sources.map((source) => reportSource(source.label, source.text)).join("");
  const weight = score == null ? "N/A" : formatScore(metric.effective_weight * 100);
  const reasonText = translateReason(metric.reason);
  const body =
    score == null
      ? `<div class='report-unavailable'><span class='unavailable-icon'>ℹ</span><div><strong>${escapeHtml(dict.na_title)}</strong><p>${escapeHtml(emptyMessage || reasonText)}</p></div></div>`
      : `<div class='report-columns'>
        ${reportColumn(dict.col_matched, matched, "matched", dict.col_matched_empty)}
        ${reportColumn(dict.col_missing, missing, "missing", dict.col_missing_empty)}
      </div>`;
  return `<article class='report-section' id='${id}'>
    <div class='report-section-top'>
      <span class='report-section-number'>${number}</span>
      <div class='report-section-title'><h4>${title}</h4><p>${subtitle}</p></div>
      <strong class='report-section-score ${score == null ? "is-na" : ""}'>${formatScore(score)}</strong>
    </div>
    ${body}
    <details class='report-calculation'><summary>${escapeHtml(dict.calc_summary)}</summary>
      <div class='report-calculation-body'>
        <p>${escapeHtml(reasonText)}</p>
        <p>${dict.calc_weight_line(weight, fmtNum(metric.weighted_points, 2))}</p>
        ${sourceList || `<p class='report-empty'>${escapeHtml(dict.calc_no_source)}</p>`}
      </div>
    </details>
  </article>`;
}

function filterBilingualObjects(items, getText, lang = resultLang) {
  if (!Array.isArray(items) || items.length < 2) return items || [];
  const isViItem = (item) => hasViAccents(getText(item));
  const isEnSentence = (item) => {
    const s = String(getText(item) || "").trim();
    return isLikelyEnOnly(s) && s.split(/\s+/).length >= 3;
  };
  if (items.some(isViItem) && items.some(isEnSentence)) {
    const filtered =
      lang === "vi"
        ? items.filter((item) => !isEnSentence(item))
        : items.filter((item) => !isViItem(item));
    if (filtered.length) return filtered;
  }
  return items;
}

function reportRoleSection(metric, tasks) {
  const dict = t();
  const score = metric.score;
  const reasonText = translateReason(metric.reason);
  const displayTasks = filterBilingualObjects(tasks, (item) => item.jd_text, resultLang);
  const rows = displayTasks
    .map((task, index) => {
      const label =
        task.status === "strong"
          ? dict.task_strong
          : task.status === "partial"
            ? dict.task_partial
            : dict.task_unverified;
      const note = task.matched_skills.length
        ? dict.task_related_skills(
            task.matched_skills.map((item) => `${item.jd_skill} ↔ ${item.cv_skill}`).join(", ")
          )
        : task.shared_actions.length
          ? dict.task_shared_actions
          : "";
      const evidence = task.cv_evidence
        ? `<p class='report-task-evidence'><b>CV · ${escapeHtml(tr(task.cv_section))}</b> ${escapeHtml(tr(task.cv_evidence))}</p>`
        : `<p class='report-task-evidence is-empty'>${escapeHtml(dict.task_no_evidence)}</p>`;
      return `<li class='report-task report-task-${task.status}'>
      <div class='report-task-heading'><span class='report-task-index'>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(tr(task.jd_text))}</p>
        <span class='report-task-status'>${label}</span><strong class='report-task-score'>${formatScore(task.score)}</strong></div>
      ${evidence}${note ? `<p class='report-task-note'>${escapeHtml(note)}</p>` : ""}
    </li>`;
    })
    .join("");
  return `<article class='report-section report-role-section' id='report-role'>
    <div class='report-section-top'><span class='report-section-number'>01</span>
      <div class='report-section-title'><h4>${escapeHtml(dict.role_title)}</h4><p>${escapeHtml(dict.role_subtitle)}</p></div>
      <strong class='report-section-score ${score == null ? "is-na" : ""}'>${formatScore(score)}</strong>
    </div>
    ${score == null ? `<div class='report-unavailable'><span class='unavailable-icon'>ℹ</span><div><strong>${escapeHtml(dict.na_short_title)}</strong><p>${escapeHtml(reasonText)}</p></div></div>` : `<ol class='report-task-list'>${rows}</ol>`}
    <details class='report-calculation'><summary>${escapeHtml(dict.calc_summary)}</summary>
      <div class='report-calculation-body'><p>${escapeHtml(reasonText)}</p>
        <p>${escapeHtml(dict.role_formula)}</p>
        <p>${dict.calc_weight_line(score == null ? "N/A" : formatScore(metric.effective_weight * 100), fmtNum(metric.weighted_points, 2))}</p>
        ${tasks.filter((task) => task.cv_evidence).map((task) => reportSource(`JD · ${tr(task.jd_text)}`, `CV · ${tr(task.cv_section)}: ${tr(task.cv_evidence)}`)).join("")}
      </div>
    </details>
  </article>`;
}

function reportEvidenceSection(items) {
  if (!items.length) return "";
  const dict = t();
  const supported = items
    .filter((item) => item.status !== "unverified")
    .map((item) => {
      const evText = tr(item.cv_evidence);
      return {
        title: tr(item.jd_text),
        detail: `CV · ${tr(item.cv_section)}: ${evText.length > 180 ? `${evText.slice(0, 180)}…` : evText}`,
        badge: item.priority === "preferred" ? dict.badge_preferred : "",
      };
    });
  const unverified = items
    .filter((item) => item.status === "unverified")
    .map((item) => ({
      title: tr(item.jd_text),
      detail: dict.sec_other_unverified_detail,
      badge: item.priority === "preferred" ? dict.badge_preferred : "",
    }));
  return `<article class='report-section' id='report-other'>
    <div class='report-section-top'>
      <span class='report-section-number'>05</span>
      <div class='report-section-title'><h4>${escapeHtml(dict.sec_other_title)}</h4><p>${escapeHtml(dict.sec_other_sub)}</p></div>
      <strong class='report-section-score is-na is-label'>${escapeHtml(dict.sec_other_badge)}</strong>
    </div>
    <div class='report-columns'>
      ${reportColumn(dict.sec_other_col_ok, supported, "matched", dict.sec_other_col_ok_empty)}
      ${reportColumn(dict.sec_other_col_rev, unverified, "review", dict.sec_other_col_rev_empty)}
    </div>
    <p class='report-evidence-note'>${escapeHtml(dict.sec_other_note)}</p>
    <details class='report-calculation'><summary>${escapeHtml(dict.sec_other_view_full)}</summary>
      <div class='report-calculation-body'>${items.filter((item) => item.status !== "unverified").map((item) => reportSource(`JD · ${tr(item.jd_text)}`, `CV · ${tr(item.cv_section)}: ${tr(item.cv_evidence)}`)).join("")}</div>
    </details>
  </article>`;
}

function renderMatch(report) {
  lastMatchReport = report;
  const dict = t();
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
  $("#overall-value").textContent = overall == null ? "N/A" : fmtNum(overall, 1);
  $("#overall-unit").textContent = overall == null ? "" : "%";
  $("#overall-title").textContent = overall == null ? dict.overall_title_na : dict.overall_title_ok;
  const active = ["job_fit", "skill_match", "experience_match", "education_match"].filter(
    (key) => scores[key].score != null
  ).length;
  $("#overall-summary").textContent = dict.overall_summary(active, formatScore(report.base_score));

  const tasks = report.responsibility_matches || [];
  const supportedTasks = tasks.filter((task) => task.status !== "unverified").length;
  const overview = [
    {
      index: "01",
      key: "job_fit",
      id: "report-role",
      title: dict.metric_job_fit,
      note: dict.note_tasks(supportedTasks, tasks.length),
    },
    {
      index: "02",
      key: "skill_match",
      id: "report-skills",
      title: dict.metric_skills,
      note: dict.note_skills(skillMatches.length, required.length + preferred.length),
    },
    {
      index: "03",
      key: "experience_match",
      id: "report-experience",
      title: dict.metric_exp,
      note: dict.note_exp(experience.jd_required_years),
    },
    {
      index: "04",
      key: "education_match",
      id: "report-education",
      title: dict.metric_edu,
      note: dict.note_edu(Boolean(education.jd_degree || (education.jd_fields || []).length)),
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
    ? dict.warning_missing(missingRequired.length, escapeHtml(missingRequired.join(", ")))
    : "";

  const bonus = $("#project-bonus");
  bonus.hidden = projectMatches.length === 0;
  bonus.open = false;
  const earnedBonus = report.project_bonus_points || 0;
  const appliedBonus = report.project_bonus_applied_points || 0;
  const capNote = earnedBonus > appliedBonus ? dict.bonus_cap_note(fmtNum(earnedBonus, 2)) : "";
  $("#project-bonus-value").textContent = dict.bonus_value(fmtNum(appliedBonus, 2));
  $("#project-bonus-summary").textContent = dict.bonus_summary(projectMatches.length, capNote);
  $("#project-bonus-evidence").innerHTML = projectMatches
    .map((item) => reportSource(`CV · ${item.jd_skill}`, tr(item.project_evidence)))
    .join("");

  const methodLabels = dict.method_labels;
  const skillFound = skillMatches.map((item) => ({
    title: item.jd_skill,
    detail: dict.skill_found_detail(
      item.cv_skill,
      methodLabels[item.match_method] || item.tier,
      formatScore(item.confidence * 100)
    ),
    badge: item.priority === "required" ? dict.badge_required : dict.badge_preferred,
  }));
  const skillMissing = [
    ...missingRequired.map((name) => ({
      title: name,
      detail: dict.skill_missing_req,
      badge: dict.badge_required,
    })),
    ...missingPreferred.map((item) => ({
      title: item.name,
      detail: dict.skill_missing_pref,
      badge: dict.badge_preferred,
    })),
  ];
  const skillSources = [
    ...skillMatches.flatMap((item) => [
      { label: `JD · ${item.jd_skill}`, text: tr(item.jd_evidence) },
      {
        label: `CV · ${item.cv_skill}`,
        text:
          item.match_method === "tfidf_cosine" || item.match_method === "rapidfuzz"
            ? `${tr(item.cv_evidence)} · cosine ${item.cosine_similarity}`
            : tr(item.cv_evidence),
      },
    ]),
    ...[...required, ...preferred]
      .filter((item) => !matchedNames.has(item.name))
      .map((item) => ({ label: dict.src_unmatched(item.name), text: tr(item.evidence) })),
  ];

  const expFound = [];
  const expMissing = [];
  if (scores.experience_match.score != null) {
    if (experience.cv_years > 0)
      expFound.push({
        title: dict.exp_years_title(fmtNum(experience.cv_years, 1)),
        detail: dict.exp_years_detail,
      });
    if (scores.experience_match.score < 100) {
      const gap = Math.max((experience.jd_required_years || 0) - (experience.cv_years || 0), 0);
      expMissing.push({
        title: dict.exp_gap_title(fmtNum(gap, 1)),
        detail: dict.exp_gap_detail(experience.jd_required_years),
      });
    }
  }

  const degreeLabels = dict.degree_labels;
  const eduFound = [];
  const eduMissing = [];
  if (education.jd_degree) {
    const item = education.degree_match
      ? {
          title: dict.edu_deg_ok_title(degreeLabels[education.cv_degree] || education.cv_degree),
          detail: dict.edu_deg_ok_detail(degreeLabels[education.jd_degree] || education.jd_degree),
        }
      : {
          title: dict.edu_deg_miss_title(degreeLabels[education.jd_degree] || education.jd_degree),
          detail: dict.edu_deg_miss_detail(degreeLabels[education.cv_degree] || dict.not_specified),
        };
    (education.degree_match ? eduFound : eduMissing).push(item);
  }
  if ((education.jd_fields || []).length) {
    const shared = education.jd_fields.filter((field) => (education.cv_fields || []).includes(field));
    const item = education.field_match
      ? { title: dict.edu_field_ok_title(shared.map(tr).join(", ")), detail: dict.edu_field_ok_detail }
      : {
          title: dict.edu_field_miss_title(education.jd_fields.map(tr).join(dict.or_word)),
          detail: dict.edu_field_miss_detail(
            (education.cv_fields || []).map(tr).join(", ") || dict.not_specified
          ),
        };
    (education.field_match ? eduFound : eduMissing).push(item);
  }

  const otherItems = report.other_requirements || [];

  $("#report-sections").innerHTML = [
    reportRoleSection(scores.job_fit, tasks),
    reportSection(
      "report-skills",
      "02",
      dict.sec_skills_title,
      dict.sec_skills_sub,
      scores.skill_match,
      skillFound,
      skillMissing,
      skillSources,
      dict.sec_skills_empty
    ),
    reportSection(
      "report-experience",
      "03",
      dict.sec_exp_title,
      dict.sec_exp_sub,
      scores.experience_match,
      expFound,
      expMissing,
      [
        { label: dict.src_jd_req, text: tr(experience.jd_text) },
        ...(experience.cv_entries || []).map((text) => ({ label: dict.src_cv_exp, text: tr(text) })),
      ],
      translateReason(scores.experience_match.reason)
    ),
    reportSection(
      "report-education",
      "04",
      dict.sec_edu_title,
      dict.sec_edu_sub,
      scores.education_match,
      eduFound,
      eduMissing,
      [
        ...(education.jd_text || []).map((text) => ({ label: dict.src_jd_edu, text: tr(text) })),
        ...(education.cv_entries || []).map((text) => ({ label: dict.src_cv_edu, text: tr(text) })),
      ],
      translateReason(scores.education_match.reason)
    ),
    reportEvidenceSection(otherItems),
  ].join("");
}

function setExtractionTab(source) {
  activeExtractionSource = source;
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
      applyStaticResultI18n();
      await ensureTranslated(
        [...collectCvTexts(body.cv_profile), ...collectJdTexts(body.jd_profile)],
        resultLang
      );
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
      applyStaticResultI18n();
      await ensureTranslated(collectMatchTexts(body), resultLang);
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
  const dict = t();

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
    tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:#5d6e69;padding:28px;">${escapeHtml(dict.batch_empty_filter)}</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const tone = scoreTone(row.overall_score);
      const rankClass = row.rank <= 3 ? `rank-${row.rank}` : "";
      const missing = row.missing_required_skills || [];
      const missingHtml = missing.length
        ? `<span class="missing-pill" title="${escapeHtml(missing.join(", "))}">${missing.length}: ${escapeHtml(missing.join(", "))}</span>`
        : `<span class="missing-pill none">${escapeHtml(dict.batch_all_met)}</span>`;
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
        <td><span class="bonus-pill">+${fmtNum(row.project_bonus_applied_points || 0, 1)}</span></td>
        <td class="mono-num">${baseText}</td>
        <td>${missingHtml}</td>
        <td><button type="button" class="inspect-btn" data-inspect-id="${escapeHtml(row.id)}">${escapeHtml(dict.batch_inspect)}</button></td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll("[data-inspect-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-inspect-id");
      const item = (lastBatchResponse.rankings || []).find((r) => r.id === id);
      if (!item) return;
      viewingBatchDetail = true;
      lastBatchDetailItem = item;
      applyStaticResultI18n();
      const origLabel = btn.textContent;
      btn.disabled = true;
      btn.textContent = "◌ ...";
      try {
        await ensureTranslated(collectMatchTexts(item.report), resultLang);
      } finally {
        btn.disabled = false;
        btn.textContent = origLabel;
      }
      renderMatch(item.report);
      $("#batch-mode-container")?.classList.add("hidden");
      $("#batch-detail-banner")?.classList.remove("hidden");
      if ($("#batch-detail-candidate-title")) {
        $("#batch-detail-candidate-title").textContent = t().detail_banner_title(
          item.rank,
          item.candidate_name,
          item.filename,
          formatScore(item.overall_score)
        );
      }
      $("#back-to-extraction")?.classList.add("hidden");
      $("#match-result")?.classList.remove("hidden");
      $("#match-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function renderBatchDashboard(data, shouldReveal = true) {
  lastBatchResponse = data;
  const dict = t();
  applyStaticResultI18n();
  const stats = data.summary_stats || {};
  const rawJdTitle = data.jd_profile?.job_info?.title;
  const jdTitle = rawJdTitle ? tr(rawJdTitle) : dict.jd_default_title;
  const topCand = data.rankings?.[0];
  if ($("#batch-result-title")) {
    $("#batch-result-title").textContent = dict.batch_title(data.total_candidates, jdTitle);
  }
  const statsGrid = $("#batch-stats-grid");
  if (statsGrid) {
    statsGrid.innerHTML = `
      <article class="batch-stat-card highlight">
        <span>${escapeHtml(dict.stat_top_label)}</span>
        <strong>${formatScore(stats.top_score)}</strong>
        <small>${escapeHtml(topCand ? topCand.candidate_name : "—")}</small>
      </article>
      <article class="batch-stat-card">
        <span>${escapeHtml(dict.stat_total_label)}</span>
        <strong>${data.total_candidates}</strong>
        <small>Taxonomy v${escapeHtml(data.taxonomy_version || "1.3.0")}</small>
      </article>
      <article class="batch-stat-card">
        <span>${escapeHtml(dict.stat_avg_label)}</span>
        <strong>${formatScore(stats.avg_score)}</strong>
        <small>${escapeHtml(dict.stat_median(formatScore(stats.median_score)))}</small>
      </article>
      <article class="batch-stat-card">
        <span>${escapeHtml(dict.stat_qual_label)}</span>
        <strong>${stats.qualified_count ?? 0} / ${data.total_candidates}</strong>
        <small>${escapeHtml(dict.stat_qual_note)}</small>
      </article>
    `;
  }
  renderBatchTable();
  if (shouldReveal) {
    $("#batch-input-stage")?.classList.add("hidden");
    $("#batch-results")?.classList.remove("hidden");
    $("#batch-results")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
    await ensureTranslated(collectBatchTexts(body), resultLang);
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
  const headers =
    resultLang === "en"
      ? [
          "Rank",
          "Candidate",
          "CV_File",
          "Language",
          "Overall_Score",
          "Base_Score",
          "Project_Bonus",
          "Job_Fit",
          "Skills",
          "Experience",
          "Education",
          "Baseline_Keyword",
          "Baseline_TFIDF",
          "Baseline_SBERT",
          "Missing_Required_Skills",
        ]
      : [
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
