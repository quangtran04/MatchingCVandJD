from app.application import translation


def test_should_skip_technical_and_contact_strings() -> None:
    assert translation.should_skip_translation("Python")
    assert translation.should_skip_translation("PyTorch")
    assert translation.should_skip_translation("CI/CD")
    assert translation.should_skip_translation("user@example.com")
    assert translation.should_skip_translation("2024 - 2026")
    assert not translation.should_skip_translation("Xây dựng hệ thống AI Agent sử dụng LLM")
    assert not translation.should_skip_translation("Develop web interfaces with React")


def test_translate_texts_batches_and_caches(monkeypatch) -> None:
    calls: list[str] = []

    def fake_google(text: str, target_lang: str, timeout: float = 8.0) -> str:
        calls.append(text)
        return text.replace("Xây dựng API", "Build API").replace("Hà Nội", "Hanoi")

    translation._CACHE.clear()
    monkeypatch.setattr(translation, "_google_translate_raw", fake_google)

    inputs = ["Xây dựng API", "Hà Nội", "Python", "Xây dựng API"]
    first = translation.translate_texts(inputs, "en")
    assert first["Xây dựng API"] == "Build API"
    assert first["Hà Nội"] == "Hanoi"
    assert first["Python"] == "Python"
    assert len(calls) == 1

    # Second call should hit in-memory cache with 0 network calls
    second = translation.translate_texts(inputs, "en")
    assert second == first
    assert len(calls) == 1


def test_translate_english_jd_to_vietnamese_skips_existing_vietnamese(monkeypatch) -> None:
    calls: list[str] = []

    def fake_google(text: str, target_lang: str, timeout: float = 8.0) -> str:
        calls.append(f"{target_lang}:{text}")
        return text.replace(
            "Develop web interfaces with React", "Phát triển giao diện web với React"
        )

    translation._CACHE.clear()
    monkeypatch.setattr(translation, "_google_translate_raw", fake_google)

    out = translation.translate_texts(
        [
            "Develop web interfaces with React",
            "Full-time",
            "Xây dựng hệ thống backend tại Hà Nội",
            "React",
        ],
        "vi",
    )
    assert out["Develop web interfaces with React"] == "Phát triển giao diện web với React"
    assert out["Full-time"] == "Toàn thời gian"
    assert out["Xây dựng hệ thống backend tại Hà Nội"] == "Xây dựng hệ thống backend tại Hà Nội"
    assert out["React"] == "React"
    assert len(calls) == 1

