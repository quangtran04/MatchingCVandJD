Điểm yếu
Thực nghiệm chỉ trên 1 cặp CV–JD:
Không đo độ chính xác trích xuất trên nhiều CV.
Không so điểm phù hợp với đánh giá của người.
Không có số liệu xếp hạng (Precision@K, nDCG, tương quan Spearman).
37 kiểm thử đơn vị chỉ chứng minh mã chạy đúng như thiết kế, không chứng minh cách chấm điểm phản ánh đúng mức phù hợp thật.
Không có baseline, dù chính Chương 1 phê phán TF-IDF cosine toàn văn và SBERT. Không có số liệu nào cho thấy cách làm của nhóm tốt hơn hai phương pháp này.
Nhiều tham số chủ quan: trọng số 40/35/15/10, ngưỡng "phù hợp một phần", độ tin cậy 0,8/0,9 của từng tầng, điểm thưởng dự án tối đa +10. Không có thí nghiệm nào để chọn hay kiểm tra độ nhạy của chúng. Độ phủ của từ điển phân loại cũng chưa được đo.
Kết luận vượt quá bằng chứng: các câu "phản ánh rất sát thực tế chuyên môn", "hoạt động chính xác", "giải quyết hiệu quả" chỉ dựa trên 1 ví dụ do nhóm tự chọn.
Xử lý tiếng Việt còn hạn chế: không tách từ ghép (nhóm đã tự nêu). Không rõ hệ thống làm tốt thế nào với CV hoàn toàn tiếng Việt, vì ví dụ duy nhất là CV tiếng Anh so với JD tiếng Việt.
Hình thức: văn phong nhiều câu rất dài, khó đọc. Tài liệu tham khảo ít (6 tài liệu học thuật). Không có bảng phân công.
Góp ý cho Nhóm 06 (N05): những việc cần sửa
Xây tập đánh giá:
Tối thiểu 3–4 JD thuộc các vị trí khác nhau, mỗi JD khoảng 20 CV (tự tạo hoặc đã ẩn danh), có cả CV tiếng Việt, tiếng Anh và song ngữ.
Hai thành viên chấm mức phù hợp độc lập (thang 1–5), báo cáo mức đồng thuận giữa hai người.
Đo hai mặt của hệ thống:
Trích xuất: độ chính xác theo trường và precision/recall của kỹ năng trên tối thiểu khoảng 50 CV.
Xếp hạng: tương quan Spearman/Kendall với điểm do người chấm, nDCG@5 cho từng JD.
Thêm baseline: TF-IDF cosine toàn văn, SBERT đa ngôn ngữ (cosine CV–JD) và so khớp từ khóa thuần, chạy trên cùng tập dữ liệu. Đây là bằng chứng cần có cho các khoảng trống mà nhóm đã nêu.
Ablation và độ nhạy:
Bỏ lần lượt tầng ngữ nghĩa, ghép cặp một-một, đối chiếu nhiệm vụ, tái phân bổ trọng số động.
Thử thay đổi bộ trọng số 40/35/15/10 để xem thứ hạng có ổn định không.
Đánh giá tính giải thích: lấy khoảng 30 câu bằng chứng do hệ thống đưa ra cho người kiểm tra xem câu đó có thật sự chứng minh nhiệm vụ tương ứng không. Báo cáo tỷ lệ bằng chứng đúng.

Viết lại kết luận cho đúng mức bằng chứng, rút gọn các câu quá dài, bổ sung tài liệu tham khảo về trích xuất thông tin CV và person–job fit cho tiếng Việt, thêm bảng phân công công việc.