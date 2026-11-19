import fitz  # PyMuPDF
import os
import re
from pathlib import Path

PDF_FILE = "../windowsScreen.pdf"
OUTPUT_DIR = "images"


def sanitize_filename(text):
    text = text.strip().lower()
    text = re.sub(r'[<>:"/\\|?*]', "", text)
    text = re.sub(r"\s+", "_", text)
    text = re.sub(r"_+", "_", text)
    return text[:200]

def get_page_title(page):
    candidates = []

    page_dict = page.get_text("dict")

    for block in page_dict["blocks"]:
        if "lines" not in block:
            continue

        for line in block["lines"]:
            for span in line["spans"]:
                text = span["text"].strip()

                if not text:
                    continue

                # Title font only
                if span["font"] != "CIDFont+F2":
                    continue

                candidates.append(
                    (
                        span["size"],
                        text
                    )
                )

    if not candidates:
        return None

    # Largest title font wins
    candidates.sort(reverse=True, key=lambda x: x[0])

    return sanitize_filename(candidates[0][1])


def get_largest_image_xref(page):
    """
    Returns the xref of the largest displayed image on the page.
    """
    images = page.get_images(full=True)

    if not images:
        return None

    best_xref = None
    best_area = 0

    for img in images:
        xref = img[0]

        try:
            rects = page.get_image_rects(xref)

            for rect in rects:
                area = rect.width * rect.height

                if area > best_area:
                    best_area = area
                    best_xref = xref

        except Exception:
            pass

    return best_xref


def save_image(doc, xref, output_path):
    image = doc.extract_image(xref)

    with open(output_path, "wb") as f:
        f.write(image["image"])


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    doc = fitz.open(PDF_FILE)

    current_title = None
    missing_counter = 0

    for page_number in range(len(doc)):
        page = doc[page_number]

        title = get_page_title(page)

        if title:
            current_title = title
            missing_counter = 0
            filename = title
        else:
            if current_title is None:
                filename = f"page_{page_number + 1}"
            else:
                missing_counter += 1
                filename = f"{current_title}_{missing_counter}"

        xref = get_largest_image_xref(page)

        if xref is None:
            print(f"Page {page_number + 1}: no image found")
            continue

        image_info = doc.extract_image(xref)
        ext = image_info["ext"]

        output_file = Path(OUTPUT_DIR) / f"{filename}.{ext}"

        save_image(doc, xref, output_file)

        print(f"Page {page_number + 1}: {output_file}")

    doc.close()


if __name__ == "__main__":
    main()