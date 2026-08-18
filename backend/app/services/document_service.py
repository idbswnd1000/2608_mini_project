import fitz


def extract_text_from_pdf(file_bytes: bytes) -> str:
    pdf = fitz.open(stream=file_bytes, filetype="pdf")

    pages = []

    for page in pdf:
        text = page.get_text()
        pages.append(text)

    pdf.close()

    return "\n".join(pages).strip()