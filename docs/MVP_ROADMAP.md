# MVP Roadmap — CV–JD Matching

## Phạm vi MVP đã chốt

Demo phải thực hiện trọn luồng dưới đây trên **một CV và một JD**:

```text
Tải tệp / dán văn bản → trích raw text → hiển thị text trên giao diện
→ trích xuất trường quan trọng → matching 3 tầng → breakdown điểm + giải thích
```

| Nguồn đầu vào | MVP hỗ trợ | Hành vi |
| --- | --- | --- |
| Dán text | Có | Dùng text trực tiếp cho CV hoặc JD |
| `.txt` | Có | Đọc UTF-8, hiển thị raw text |
| PDF có lớp text (digital PDF) | Có | Dùng PyMuPDF để trích text; không OCR |
| Word `.docx` | Có | Đọc paragraph và table bằng `python-docx` |
| PDF scan | Không | Báo lỗi vì không có lớp text; MVP không dùng OCR |
| Ảnh JPG/PNG/WEBP | Không | Không nằm trong phạm vi MVP |

> Lưu ý quan trọng: yêu cầu “ảnh → text” bắt buộc cần OCR. MVP này chủ động không dùng OCR, vì vậy chỉ nhận PDF có lớp text, TXT và DOCX.

Không cần DOCX, LLM, database production, Celery, RBAC hay semantic search phức tạp cho bản nộp môn học. Có thể bổ sung sau khi bản demo cốt lõi chạy ổn định.

## Tiêu chí hoàn thành MVP

Người dùng tải/dán CV và JD, thấy text đã trích xuất ở hai khung, bấm **Phân tích**, rồi nhận được:

- CV/JD đã trích xuất: `summary`, `skills`, `experience`, `education`, `projects`, `certificates`, `languages` (trường không có thì trả mảng rỗng/null).
- JD có `required_skills`, `preferred_skills`, `minimum_years_experience`, `education_requirements`.
- Kỹ năng match được phân loại `exact`, `normalized`, `semantic`; kèm cặp từ và điểm tin cậy.
- `skill_match`, `experience_match`, `education_match`, `project_relevance` và `overall_score` trong thang 0–100; `project_bonus_points` là điểm cộng 0–10.
- Danh sách `matched_skills`, `missing_required_skills`, và lý do tính điểm.

## Giai đoạn 0 — Dữ liệu và tiêu chí đánh giá (1–2 ngày)

- Tạo tối thiểu 15–20 cặp CV/JD tiếng Việt hoặc Anh đã ẩn danh/tự tạo.
- Gán nhãn thủ công: skills CV, skills bắt buộc/ưu tiên của JD, số năm kinh nghiệm, học vấn và score kỳ vọng.
- Tạo `skill_taxonomy.json`: canonical skill, aliases và nhóm skill. Ví dụ `JavaScript: [JS, Javascript]`.
- Chốt weights ban đầu: Skill 45%, Experience 25%, Education 10%, Project relevance 20%.

**Done when:** Có bảng test case với kết quả kỳ vọng; không dùng CV thật trong Git.

## Giai đoạn 1 — Nhập liệu và hiển thị raw text (2–3 ngày)

- Hai khu vực độc lập: **CV input** và **JD input**, mỗi khu vực chọn *Upload* hoặc *Paste text*.
- Validate phần mở rộng/kích thước; nhận `.txt`, `.docx`, `.pdf`.
- Viết `extract_text(file)`: TXT decode UTF-8, DOCX qua `python-docx`, PDF qua PyMuPDF; báo lỗi nếu PDF không có text layer.
- Sau khi load, hiển thị raw text trong textarea và cho phép người dùng chỉnh text trước khi phân tích.
- Hiển thị lỗi dễ hiểu: file sai loại, PDF scan không được hỗ trợ, file rỗng, text quá ngắn.

**Done when:** 90% tệp mẫu TXT/DOCX/digital PDF hiển thị text đúng; PDF scan trả lỗi rõ ràng; không cho phép chạy matching khi CV hoặc JD chưa có text.

## Giai đoạn 2 — Trích xuất thông tin CV và JD (3–4 ngày)

- Chuẩn hoá: lowercase, loại khoảng trắng dư, chuẩn hoá Unicode, tách câu/dòng.
- Rule/regex cho email, URL, số năm kinh nghiệm, khoảng thời gian, học vị, chứng chỉ.
- Dictionary + pattern cho skill; trích summary, kinh nghiệm và project theo các heading phổ biến (`Kinh nghiệm`, `Skills`, `Education`, `Projects`...).
- Phân biệt JD: bắt buộc qua cụm `required`, `must have`, `yêu cầu`; ưu tiên qua `preferred`, `nice to have`, `ưu tiên`.
- Trả dữ liệu theo schema thống nhất và giữ đoạn text nguồn (`evidence`) của từng trường.

**Done when:** Đạt F1 tối thiểu do nhóm tự đặt trên tập gán nhãn; trường trích xuất được hiển thị rõ trong UI để giảng viên kiểm tra.

## Giai đoạn 3 — Matching 3 tầng và scoring (4–5 ngày)

Thứ tự matching cho từng skill của JD; một skill CV chỉ tính cho một yêu cầu bắt buộc gần nhất để tránh cộng điểm hai lần.

| Tầng | Điều kiện | Ví dụ | Cách làm MVP |
| --- | --- | --- | --- |
| 1. Exact Match | Chuỗi canonical giống nhau | `Java` ↔ `Java` | So sánh sau lowercase/trim |
| 2. Normalized Match | Cùng canonical sau alias/chuẩn hoá, hoặc đủ gần về từ vựng | `JS` ↔ `JavaScript` | `skill_taxonomy.json` + token hóa, TF-IDF cosine và RapidFuzz khi cần |
| 3. Semantic Match | Khác từ nhưng cùng/ngần nghĩa | `Relational Database` ↔ `PostgreSQL` | Mapping thủ công theo nhóm skill; embedding là phần nâng cao |

- Tính `skill_match`: required skills có trọng số cao hơn preferred skills.
- Tính `experience_match`: `min(cv_years / jd_required_years, 1) × 100`; JD không nêu số năm thì đánh dấu N/A và phân phối lại trọng số.
- Tính `education_match`: exact/normalized degree-field match; nếu JD không yêu cầu thì N/A.
- Tính `project_relevance`: tỷ lệ JD skills xuất hiện trong phần project của CV; chỉ dùng làm điểm cộng, không trừ điểm khi thiếu dự án.
- Overall mặc định: chuẩn hoá trọng số các tiêu chí chính có dữ liệu, sau đó cộng tối đa 10 điểm từ dự án và chặn ở 100.

```text
base = weighted_average(skill × 0.45, experience × 0.25, education × 0.10)
project_bonus = 10 × project_skills_matched / jd_skills_total
overall = min(100, base + project_bonus)
```

Chỉ tính lại trọng số của các tiêu chí chính có dữ liệu. Nếu thiếu skill bắt buộc, luôn hiện warning; không tự động kết luận loại ứng viên. Nhiệm vụ trong mô tả công việc và yêu cầu mềm/ưu tiên được đối chiếu với bằng chứng CV, hiển thị trạng thái có bằng chứng hoặc cần xác minh thêm, không đưa vào điểm số.

**Done when:** Kết quả hiển thị điểm kỹ năng, kinh nghiệm, học vấn, điểm cộng dự án và overall; từng con số có thể truy ngược về dữ liệu đầu vào. Yêu cầu mềm hiện bằng chứng hoặc cần xác minh thêm, không làm giảm điểm.

## Giai đoạn 4 — Giao diện, kiểm thử và báo cáo (2–3 ngày)

- UI tối thiểu: hai input panel, hai raw-text panel, nút phân tích, extracted fields, bảng matched/missing skills, score cards và overall gauge.
- Unit test cho parser PDF/TXT, normalizer, từng tầng matching và công thức score.
- Test end-to-end cho ít nhất 5 cặp CV/JD mẫu.
- Báo cáo: mô tả dữ liệu, pipeline NLP, thuật toán 3 tầng, công thức score, bảng kết quả, ca lỗi và giới hạn.

**Done when:** Có video/demo trực tiếp chạy một cặp CV/JD, toàn bộ test pass và số liệu thực nghiệm có thể tái lập.

## Phần nâng cao sau MVP

1. Bật OCR cho ảnh/PDF scan (Tesseract hoặc dịch vụ OCR), đo lỗi OCR trước khi matching.
2. Sentence-BERT multilingual cho semantic match; so sánh với mapping thủ công bằng Precision@k hoặc đánh giá chuyên gia.
3. NER/LLM extraction theo JSON Schema, bắt buộc evidence và cơ chế sửa thủ công.
4. Lưu lịch sử, batch ranking nhiều CV, authentication và triển khai Docker.

## Rủi ro cần nêu trong báo cáo

| Rủi ro | Cách xử lý MVP |
| --- | --- |
| CV có bố cục PDF phức tạp hoặc là bản scan | Báo không hỗ trợ; OCR là phần nâng cao sau MVP |
| Viết tắt/đồng nghĩa skill | Taxonomy aliases + tầng normalized/semantic có version |
| Semantic match bị gán quá rộng | Mapping theo nhóm skill, đặt ngưỡng và hiển thị lý do |
| JD thiếu thông tin (VD không nêu học vấn) | Tiêu chí N/A, chuẩn hoá lại weights |
| Điểm số gây hiểu nhầm | Hiển thị breakdown/missing skills; đây là công cụ hỗ trợ, không tự động loại |
