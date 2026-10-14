# CV–JD Matching

Hệ thống tải CV, trích xuất thông tin có cấu trúc và đánh giá mức độ phù hợp với Job Description (JD). Mục tiêu MVP là tạo kết quả **có thể giải thích được**: điểm tổng, từng tiêu chí đóng góp, kỹ năng khớp/thiếu và bằng chứng được trích từ CV.

## Phạm vi MVP

- Nhận CV/JD bằng text dán trực tiếp, TXT hoặc PDF có lớp text; hiển thị raw text trước khi phân tích.
- Trích xuất hồ sơ chuẩn hoá: thông tin cơ bản, kỹ năng, kinh nghiệm, học vấn, chứng chỉ, ngôn ngữ.
- Phân tích yêu cầu JD và phân loại bắt buộc/ưu tiên.
- Tính điểm theo các nhóm kỹ năng, kinh nghiệm, học vấn/ngôn ngữ; trả về lý do và các kỹ năng còn thiếu.
- Lưu hồ sơ, tệp gốc (cục bộ ở môi trường phát triển) và kết quả phân tích.

MVP **không** tự động loại ứng viên, không suy luận thuộc tính nhạy cảm (tuổi, giới tính, dân tộc, tôn giáo, tình trạng hôn nhân...) và luôn coi điểm số là công cụ hỗ trợ người tuyển dụng.

## Kiến trúc

```text
Client / Admin UI
       │ HTTP
       ▼
FastAPI routers ──► application services ──► domain (CV, JD, scoring)
       │                       │                    │
       │                       ▼                    ▼
       └────────────► adapters: parser, OCR, NLP/LLM, repository
                                           │
                                      PostgreSQL / Object storage
```

Luồng xử lý MVP: `upload/dán text → kiểm tra tệp → trích raw text → hiển thị text → chuẩn hoá schema → phân tích JD → matching → trả kết quả`. Chỉ nhận TXT, Word `.docx` và PDF có lớp text; PDF scan/ảnh không được trích text trong MVP vì không dùng OCR.

## Cấu trúc thư mục

```text
.
├── app/
│   ├── api/                 # HTTP routers, request/response schemas, dependency injection
│   ├── application/         # Use-cases: ingest CV, parse JD, run matching
│   ├── core/                # Settings, logging, security, exception handlers
│   ├── domain/              # Entity/value objects, interfaces, scoring thuần nghiệp vụ
│   ├── infrastructure/      # SQLAlchemy, storage, parser PDF/DOCX, OCR, LLM clients
│   ├── workers/             # Background jobs khi xử lý tệp lớn
│   └── main.py              # FastAPI application factory
├── tests/                   # unit / integration / e2e tests, không dùng dữ liệu CV thật
├── alembic/                 # Database migrations
├── docs/                    # Roadmap, kiến trúc, API contract, quyết định kỹ thuật
├── scripts/                 # Seed dữ liệu giả, tác vụ phát triển lặp lại được
├── pyproject.toml           # Dependencies, tooling và cấu hình Python
├── docker-compose.yml       # API + PostgreSQL (và Redis khi bật worker)
└── README.md
```

## Công nghệ đề xuất

| Nhu cầu | Lựa chọn MVP | Lý do |
| --- | --- | --- |
| API | FastAPI + Pydantic | Type-safe, có OpenAPI sẵn |
| DB | PostgreSQL + SQLAlchemy + Alembic | Dữ liệu quan hệ, truy vết phiên bản kết quả |
| Đọc tài liệu | PyMuPDF | Trích text từ digital PDF |
| OCR (sau MVP) | Tesseract/pytesseract | Cần thiết nếu muốn ảnh/PDF scan → text |
| NLP | Token hóa Unicode + TF-IDF cosine + RapidFuzz; spaCy cho mở rộng | Chuẩn hoá và so khớp có giải thích được |
| Semantic matching (giai đoạn 2) | sentence-transformers | Bổ sung ngữ nghĩa, không thay thế luật |
| Queue (khi cần) | Redis + Celery | Tách OCR/LLM dài khỏi request HTTP |
| Test/quality | pytest, ruff, mypy | Giữ chất lượng khi mở rộng |

Không nên gọi LLM trực tiếp trong router. Nếu dùng LLM, chỉ dùng ở adapter để tạo cấu trúc theo JSON Schema, lưu prompt/model/version và luôn có đường fallback dựa trên rule.

## Khởi động

Xem hướng dẫn từng bước ở mục [Cách chạy project](#cách-chạy-project) cuối README.

## Nguyên tắc scoring

Điểm nền lấy JD làm trung tâm: mô tả công việc 40%, kỹ năng ứng viên 35%, số năm kinh nghiệm 15% và học vấn 10%. Chỉ các tiêu chí JD có dữ liệu mới được tính và trọng số còn lại được chuẩn hoá. Kỹ năng bắt buộc được tính gấp đôi kỹ năng ưu tiên trong điểm kỹ năng. Kỹ năng JD xuất hiện trong phần dự án của CV tạo điểm cộng tối đa 10 điểm; kỹ năng bắt buộc thiếu được cảnh báo, không tự động loại ứng viên. Mỗi kết quả có bằng chứng từ CV/JD và phiên bản thuật toán để kiểm tra lại.

## Bảo mật & dữ liệu cá nhân

- CV là PII: mã hoá khi lưu, dùng URL tải lên có thời hạn, RBAC và audit log cho thao tác xem/tải xuống.
- Không commit CV/JD thật, token API hoặc file `.env`.
- Đặt thời hạn xoá tệp, hỗ trợ xoá ứng viên theo yêu cầu và chỉ lưu tối thiểu dữ liệu cần thiết.
- Kiểm thử với dữ liệu tổng hợp/đã ẩn danh.

Chi tiết triển khai theo giai đoạn ở [docs/MVP_ROADMAP.md](docs/MVP_ROADMAP.md) và các quyết định kiến trúc ở [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Cách chạy project

Yêu cầu **Python 3.11 trở lên**. Mở PowerShell tại thư mục gốc của project (thư mục chứa `pyproject.toml`), rồi chạy:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Sau khi server khởi động, mở:

- Giao diện: <http://127.0.0.1:8000/>
- Tài liệu API (Swagger): <http://127.0.0.1:8000/docs>
- Kiểm tra server: <http://127.0.0.1:8000/health> (trả về `{"status":"ok"}`)

Trên giao diện, dán nội dung CV và JD, hoặc tải hai tệp TXT, DOCX hay PDF có lớp text (tối đa 10 MB mỗi tệp). Nếu tải tệp, bấm **Trích xuất văn bản** trước và kiểm tra/chỉnh sửa nội dung trong hai ô nhập. Sau đó bấm **Trích xuất thông tin** để xem dữ liệu CV/JD, rồi bấm **Đánh giá phù hợp** để xem từng nhiệm vụ JD có bằng chứng nào trong CV, bốn tiêu chí chính, điểm cộng dự án và nguồn tính điểm. Có thể dùng `tests/textcv.txt` và `tests/testjd.txt` để thử. Tiêu chí JD không có dữ liệu được hiển thị `N/A` và trọng số được phân bổ lại cho các tiêu chí còn lại.

Phiên bản hiện tại chạy trực tiếp, không cần tạo `.env` hoặc khởi động PostgreSQL. Dừng server bằng `Ctrl+C`. Muốn chạy kiểm thử:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

### Matching và cách tính điểm

Nút **Đánh giá phù hợp** gọi `POST /api/match` với JSON `{"cv_text":"...","jd_text":"..."}`. API trích xuất lại CV/JD từ văn bản hiện tại rồi trả về `matched_skills`, `missing_required_skills`, `scores`, `overall_score` và bằng chứng nguồn. Có thể thử trực tiếp trong Swagger ở `/docs`.

- Skill: khớp `exact` (100%), `normalized` bằng alias, TF-IDF cosine hoặc RapidFuzz (tối đa 95%), rồi `semantic` theo mapping có kiểm soát (80%). Một skill CV chỉ được gán cho một yêu cầu JD; yêu cầu bắt buộc có trọng số gấp đôi yêu cầu ưu tiên. Hai lựa chọn nối bằng “or/hoặc” được tính là một yêu cầu.
- Mô tả công việc: mỗi nhiệm vụ JD được so với các câu trong **Experience** và **Projects** của CV bằng kỹ năng được nhận diện, hành động tương ứng và TF-IDF cosine. Có bằng chứng trực tiếp thì hiện *Phù hợp rõ*; có kinh nghiệm cùng công nghệ hoặc công việc liên quan thì hiện *Phù hợp một phần*; chưa có bằng chứng thì hiện *Chưa có bằng chứng*. Điểm mục này là trung bình điểm các nhiệm vụ JD; từng nhiệm vụ hiển thị câu CV làm bằng chứng. Kỹ năng cụ thể chưa được chứng minh không được coi là đã có chỉ vì CV nhắc đến lĩnh vực rộng hơn.
- Experience: `min(số năm CV / số năm JD, 1) × 100`; các khoảng thời gian làm việc trùng nhau chỉ được tính một lần. JD không nêu số năm hoặc CV có kinh nghiệm nhưng không thể định lượng thì hiển thị N/A.
- Education: so học vị tối thiểu và ngành học (kể cả alias tiếng Việt/Anh); JD không có yêu cầu tương ứng thì N/A.
- Project relevance: số yêu cầu skill JD xuất hiện trong **Projects** của CV chia cho tổng số yêu cầu skill JD; chỉ tạo điểm cộng, không lấy skill từ phần khác của CV.

`base_score` được tính từ Mô tả công việc 40%, Skill 35%, Experience 15% và Education 10%; tiêu chí N/A được bỏ qua rồi chuẩn hoá lại trọng số còn lại. Kỹ năng JD có bằng chứng trong mục Projects của CV tạo **điểm cộng tối đa 10 điểm**: `project_bonus_points = 10 × số kỹ năng JD có trong Projects / tổng số kỹ năng JD`. `overall_score = min(100, base_score + project_bonus_points)`; không có dự án phù hợp thì không bị trừ điểm. `project_relevance` vẫn là tỷ lệ tham khảo, không có trọng số trong điểm nền. Các skill bắt buộc còn thiếu luôn hiện cảnh báo; điểm số không tự động loại ứng viên. Taxonomy và ánh xạ semantic nằm trong `app/data/skill_taxonomy.json` để có thể kiểm tra/chỉnh sửa.

Nhiệm vụ trong mô tả công việc có điểm riêng; dự án cũng có thể là bằng chứng cho nhiệm vụ và vẫn chỉ cộng thưởng kỹ năng dự án theo công thức trên. Yêu cầu về động lực, cách làm việc, dự án/cuộc thi và công cụ AI hỗ trợ lập trình được ghi nhận theo **bằng chứng cụ thể** hoặc **cần xác minh thêm**, không đưa vào điểm số vì CV không thể chứng minh đầy đủ phẩm chất. Ví dụ, chỉ ghi nhận công cụ AI hỗ trợ lập trình khi CV nêu Copilot/Cursor hoặc nêu rõ ChatGPT/Claude được dùng để viết mã. Bộ so khớp nhiệm vụ hiện dùng quy tắc, taxonomy và TF-IDF cosine; chưa dùng embedding và vẫn cần người đọc xác minh ngữ cảnh.

**NLP đang sử dụng:** văn bản CV/JD được tách mục; các cụm skill được chuẩn hóa Unicode và tách token (giữ nguyên `C#`, `C++`). Khi matching tên skill, hệ thống tạo hai vector TF-IDF: một theo token, một theo n-gram ký tự dài 3–4; lấy điểm cosine cao hơn. Với `tf = 1 + log(số lần xuất hiện)` và `idf = log((N + 1)/(df + 1)) + 1`, điểm cosine từ `0` đến `1` được dùng cho tầng normalized khi đạt ngưỡng `0.82`. API trả `cosine_similarity` và `match_method` cho từng cặp để kiểm tra. TF-IDF cosine đo mức giống **từ vựng**, không phải độ gần nghĩa đã học từ dữ liệu; ví dụ `Relational Database` ↔ `PostgreSQL` vẫn do taxonomy semantic quyết định. Dự án chưa tải/chạy mô hình embedding huấn luyện sẵn, nên có thể chạy offline. Tách token tiếng Việt hiện dựa trên ranh giới ký tự/khoảng trắng, chưa dùng mô hình tách từ tiếng Việt.
