from __future__ import annotations

from bs4 import BeautifulSoup
import httpx

from core.ingestion.document_parser import ParsedSection


class WebScraper:
    """Extract clean text from a single URL."""

    def __init__(self, timeout_seconds: float = 60.0) -> None:
        self.timeout_seconds = timeout_seconds

    def parse_url(self, url: str) -> list[ParsedSection]:
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }

        with httpx.Client(timeout=self.timeout_seconds, follow_redirects=True, headers=headers) as client:
            response = client.get(url)
            response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "svg"]):
            tag.decompose()

        sections: list[ParsedSection] = []
        current_title = (soup.title.string or "Web Page").strip() if soup.title else "Web Page"
        buffer: list[str] = []

        def flush() -> None:
            if not buffer:
                return
            text = "\n".join(buffer).strip()
            if text:
                sections.append(
                    ParsedSection(
                        text=text,
                        source_file=None,
                        source_uri=url,
                        page_number=None,
                        section_title=current_title,
                    )
                )
            buffer.clear()

        for element in soup.find_all(["h1", "h2", "h3", "p", "li"]):
            text = element.get_text(" ", strip=True)
            if not text:
                continue
            if element.name in {"h1", "h2", "h3"}:
                flush()
                current_title = text
            else:
                buffer.append(text)

        flush()

        if sections:
            return sections

        fallback = soup.get_text("\n", strip=True)
        if not fallback:
            return []

        return [
            ParsedSection(
                text=fallback,
                source_file=None,
                source_uri=url,
                page_number=None,
                section_title=current_title,
            )
        ]
