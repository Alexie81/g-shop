from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Iterable

from PIL import Image as PILImage
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "output" / "pdf" / "fise-iesire-service-g-shop"
LOGO = ROOT / "api" / "assets" / "logo.png"

PAGE_W, PAGE_H = A4
MARGIN = 22
CONTENT_W = PAGE_W - 2 * MARGIN

ELECTRIC = HexColor("#075CFF")
ELECTRIC_DARK = HexColor("#0646C8")
ELECTRIC_LIGHT = HexColor("#EAF1FF")
NAVY = HexColor("#07152D")
SLATE = HexColor("#62718A")
LINE = HexColor("#E4EAF3")
CANVAS = HexColor("#F5F8FD")
SUCCESS = HexColor("#14A83B")


def register_fonts() -> None:
    regular = next(
        (path for path in (Path(r"C:\Windows\Fonts\segoeui.ttf"), Path(r"C:\Windows\Fonts\arial.ttf")) if path.exists()),
        None,
    )
    bold = next(
        (path for path in (Path(r"C:\Windows\Fonts\segoeuib.ttf"), Path(r"C:\Windows\Fonts\arialbd.ttf")) if path.exists()),
        None,
    )
    if not regular or not bold:
        raise FileNotFoundError("Nu am găsit fonturile Windows necesare pentru diacritice.")
    if "GShop-Regular" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("GShop-Regular", str(regular)))
    if "GShop-Bold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("GShop-Bold", str(bold)))


def value(data: dict[str, Any], *path: str, default: str = "") -> str:
    current: Any = data
    for part in path:
        if not isinstance(current, dict) or part not in current:
            return default
        current = current[part]
    if current is None:
        return default
    if isinstance(current, bool):
        return "DA" if current else "NU"
    return str(current)


def first_value(data: dict[str, Any], paths: Iterable[tuple[str, ...]]) -> str:
    for path in paths:
        candidate = value(data, *path)
        if candidate:
            return candidate
    return ""


def client_name(data: dict[str, Any]) -> str:
    return " ".join(
        part
        for part in (value(data, "client", "firstName"), value(data, "client", "lastName"))
        if part
    )


def full_address(data: dict[str, Any], root: str) -> str:
    return ", ".join(
        part
        for part in (
            value(data, root, "address"),
            value(data, root, "city"),
            value(data, root, "county"),
            value(data, root, "postalCode"),
            value(data, root, "country"),
        )
        if part
    )


def rounded_box(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    *,
    radius: float = 9,
    fill: Color = white,
    stroke: Color = LINE,
    line_width: float = 0.85,
) -> None:
    pdf.setFillColor(fill)
    pdf.setStrokeColor(stroke)
    pdf.setLineWidth(line_width)
    pdf.roundRect(x, y, width, height, radius, fill=1, stroke=1)


def draw_background(pdf: canvas.Canvas) -> None:
    pdf.setFillColor(CANVAS)
    pdf.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#EDF4FF"))
    pdf.circle(PAGE_W + 42, PAGE_H - 20, 98, fill=1, stroke=0)
    pdf.setFillColor(HexColor("#F1F6FF"))
    pdf.circle(-48, -28, 88, fill=1, stroke=0)


def draw_logo(pdf: canvas.Canvas, x: float, y: float, size: float = 45) -> None:
    if not LOGO.exists():
        return
    with PILImage.open(LOGO) as source:
        rgba = source.convert("RGBA")
        flattened = PILImage.new("RGB", rgba.size, "white")
        flattened.paste(rgba, mask=rgba.getchannel("A"))
        pdf.drawInlineImage(flattened, x, y, width=size, height=size, preserveAspectRatio=True)


def fit_text(text: str, font: str, size: float, width: float) -> str:
    if not text or pdfmetrics.stringWidth(text, font, size) <= width:
        return text
    suffix = "..."
    current = text
    while current and pdfmetrics.stringWidth(current + suffix, font, size) > width:
        current = current[:-1]
    return current.rstrip() + suffix


def wrap_text(text: str, font: str, size: float, width: float) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if pdfmetrics.stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_header(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    y = 758
    rounded_box(pdf, MARGIN, y, CONTENT_W, 62, radius=13)
    pdf.setFillColor(ELECTRIC)
    pdf.roundRect(MARGIN, y, 6, 62, 3, fill=1, stroke=0)
    draw_logo(pdf, MARGIN + 17, y + 8, 46)
    pdf.setFillColor(NAVY)
    pdf.setFont("GShop-Bold", 14.8)
    pdf.drawString(MARGIN + 76, y + 38, "FIȘĂ DE IEȘIRE DIN SERVICE")
    pdf.setFillColor(ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 7.4)
    pdf.drawString(MARGIN + 76, y + 22, "PREDARE ȘI CONFIRMARE CLIENT | G-SHOP")

    info_x = PAGE_W - MARGIN - 230
    rounded_box(pdf, info_x, y + 10, 218, 42, radius=8, fill=ELECTRIC_LIGHT, stroke=HexColor("#B9D0FF"))
    fields = (
        ("NR. FIȘĂ", first_value(data, (("exit", "number"), ("sheet", "exitNumber"))), 10, 91),
        ("DATA ȘI ORA", first_value(data, (("exit", "date"), ("sheet", "deliveredAt"))), 116, 91),
    )
    for label, field_value, offset, width in fields:
        pdf.setFillColor(ELECTRIC_DARK)
        pdf.setFont("GShop-Bold", 5.6)
        pdf.drawString(info_x + offset, y + 37, label)
        pdf.setStrokeColor(HexColor("#9ABEFF"))
        pdf.setLineWidth(0.8)
        pdf.line(info_x + offset, y + 18, info_x + offset + width, y + 18)
        if field_value:
            pdf.setFillColor(NAVY)
            pdf.setFont("GShop-Bold", 6.3)
            pdf.drawString(info_x + offset + 3, y + 21, fit_text(field_value, "GShop-Bold", 6.3, width - 6))


def draw_footer(pdf: canvas.Canvas) -> None:
    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(0.6)
    pdf.line(MARGIN, 38, PAGE_W - MARGIN, 38)
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Regular", 4.45)
    pdf.drawString(
        MARGIN,
        26,
        "În temeiul legii: OG 21/1992 | Legea 193/2000 | Codul civil | GDPR (UE) 2016/679 | Legea 190/2018.",
    )
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", 5.3)
    pdf.drawCentredString(PAGE_W / 2, 18, "Pagina 1/1")
    pdf.setFillColor(ELECTRIC_DARK)
    pdf.drawRightString(PAGE_W - MARGIN, 18, "G-SHOP | IEȘIRE SERVICE")


def section_title(pdf: canvas.Canvas, y: float, number: int, title: str, subtitle: str = "") -> None:
    x = MARGIN + 3
    pdf.setFillColor(ELECTRIC)
    pdf.circle(x + 8, y + 8, 8, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("GShop-Bold", 7.3)
    pdf.drawCentredString(x + 8, y + 5.3, str(number))
    pdf.setFillColor(NAVY)
    pdf.setFont("GShop-Bold", 9.8)
    pdf.drawString(x + 22, y + 5, title)
    if subtitle:
        pdf.setFillColor(SLATE)
        pdf.setFont("GShop-Bold", 6.0)
        pdf.drawRightString(PAGE_W - MARGIN - 5, y + 5, subtitle)


def draw_line_field(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    label: str,
    field_value: str = "",
    *,
    label_size: float = 5.7,
    label_width: float | None = None,
) -> None:
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", label_size)
    pdf.drawString(x, y + 3, label.upper())
    computed = label_width or pdfmetrics.stringWidth(label.upper(), "GShop-Bold", label_size) + 7
    line_x = min(x + computed, x + width - 14)
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.8)
    pdf.line(line_x, y, x + width, y)
    if field_value:
        pdf.setFillColor(NAVY)
        pdf.setFont("GShop-Regular", 6.8)
        pdf.drawString(line_x + 4, y + 2, fit_text(field_value, "GShop-Regular", 6.8, x + width - line_x - 7))


def draw_company(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    y = 704
    rounded_box(pdf, MARGIN, y, CONTENT_W, 44, radius=8)
    draw_line_field(pdf, 32, 730, 190, "Denumire juridică", value(data, "company", "legalName"), label_width=64)
    draw_line_field(pdf, 230, 730, 105, "CUI / CIF", value(data, "company", "taxId"), label_size=5.1, label_width=34)
    draw_line_field(pdf, 343, 730, 220, "Registrul Comerțului", value(data, "company", "tradeRegisterNumber"), label_size=5.1, label_width=103)
    draw_line_field(pdf, 32, 716, 531, "Sediu", full_address(data, "company"), label_width=32)
    draw_line_field(pdf, 32, 705, 210, "Telefon", value(data, "company", "phone"), label_width=36)
    draw_line_field(pdf, 250, 705, 313, "Email", value(data, "company", "email"), label_width=34)


def draw_reference_band(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    y, height = 657, 36
    rounded_box(pdf, MARGIN, y, CONTENT_W, height, radius=7, fill=ELECTRIC_LIGHT, stroke=HexColor("#B9D0FF"))
    intake_number = first_value(data, (("intake", "number"), ("sheet", "number")))
    intake_date = first_value(data, (("intake", "date"), ("sheet", "receivedAt")))
    estimate_number = first_value(data, (("estimate", "number"), ("sheet", "finalEstimateNumber")))
    estimate_date = first_value(data, (("estimate", "date"), ("sheet", "finalEstimateAt")))
    draw_line_field(pdf, MARGIN + 11, y + 20, 315, "Pentru fișa de intrare nr.", intake_number, label_width=125)
    draw_line_field(pdf, MARGIN + 338, y + 20, CONTENT_W - 349, "Din data", intake_date, label_width=46)
    draw_line_field(pdf, MARGIN + 11, y + 5, 315, "Cu devizul final nr.", estimate_number, label_width=103)
    draw_line_field(pdf, MARGIN + 338, y + 5, CONTENT_W - 349, "Din data", estimate_date, label_width=46)


def draw_client_equipment(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(pdf, 630, 1, "Client și echipament", "datele documentelor de service")
    y, height = 515, 102
    gap = 10
    card_width = (CONTENT_W - gap) / 2
    rounded_box(pdf, MARGIN, y, card_width, height)
    rounded_box(pdf, MARGIN + card_width + gap, y, card_width, height)
    left_x = MARGIN + 11
    right_x = MARGIN + card_width + gap + 11
    inner_width = card_width - 22
    positions = (79, 60, 41, 22, 4)
    left = (
        ("Nume client", client_name(data), 5.8),
        ("Telefon", value(data, "client", "phone"), 5.8),
        ("Telefon secundar", value(data, "client", "secondaryPhone"), 5.2),
        ("Email", value(data, "client", "email"), 5.8),
        ("Adresă", full_address(data, "client"), 5.8),
    )
    right = (
        ("Tip echipament", value(data, "sheet", "equipment"), 5.5),
        ("Marcă", value(data, "sheet", "brand"), 5.8),
        ("Model", value(data, "sheet", "model"), 5.8),
        ("Serie / IMEI (dacă există)", value(data, "sheet", "serialNumber"), 4.5),
        ("Accesorii predate", value(data, "sheet", "accessories"), 5.1),
    )
    for (label, field_value, size), offset in zip(left, positions):
        draw_line_field(pdf, left_x, y + offset, inner_width, label, field_value, label_size=size, label_width=84)
    for (label, field_value, size), offset in zip(right, positions):
        draw_line_field(pdf, right_x, y + offset, inner_width, label, field_value, label_size=size, label_width=84)


def draw_defect(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(pdf, 489, 2, "Defect reclamat de client", "preluat din fișa de intrare")
    y, height = 405, 70
    rounded_box(pdf, MARGIN, y, CONTENT_W, height)
    text = value(data, "sheet", "reportedIssue")
    inner_x = MARGIN + 11
    inner_width = CONTENT_W - 22
    if text:
        lines = wrap_text(text, "GShop-Regular", 7.0, inner_width)
        pdf.setFillColor(NAVY)
        pdf.setFont("GShop-Regular", 7.0)
        for index, line in enumerate(lines[:4]):
            pdf.drawString(inner_x, y + height - 18 - index * 13, line)
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.75)
    for index in range(4):
        line_y = y + height - 21 - index * 14
        pdf.line(inner_x, line_y, inner_x + inner_width, line_y)


def checkbox(pdf: canvas.Canvas, x: float, y: float, label: str, checked: bool = False) -> None:
    size = 10
    pdf.setStrokeColor(SLATE)
    pdf.setLineWidth(0.9)
    pdf.roundRect(x, y - 1, size, size, 1.5, fill=0, stroke=1)
    if checked:
        pdf.setStrokeColor(SUCCESS)
        pdf.setLineWidth(1.6)
        pdf.line(x + 2, y + 3, x + 4, y + 1)
        pdf.line(x + 4, y + 1, x + 8.5, y + 8)
    pdf.setFillColor(NAVY)
    pdf.setFont("GShop-Bold", 7.0)
    pdf.drawString(x + size + 5, y, label)


def draw_product_state(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(pdf, 379, 3, "Stare produs", "starea la momentul predării")
    y, height = 322, 44
    rounded_box(pdf, MARGIN, y, CONTENT_W, height, fill=ELECTRIC_LIGHT, stroke=HexColor("#B9D0FF"))
    state = value(data, "exit", "productState").upper()
    checkbox(pdf, MARGIN + 22, y + 17, "Reparat", state == "REPAIRED")
    checkbox(pdf, MARGIN + 162, y + 17, "În stare inițială", state in ("INITIAL", "UNCHANGED"))


def draw_stamp_placeholder(pdf: canvas.Canvas, x: float, y: float, width: float, height: float) -> None:
    pdf.setStrokeColor(HexColor("#A9B8CC"))
    pdf.setLineWidth(0.8)
    pdf.setDash(3, 2)
    pdf.roundRect(x, y, width, height, 7, fill=0, stroke=1)
    pdf.setDash()


def draw_pickup(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(pdf, 296, 4, "Ridicarea produsului", "confirmarea clientului")
    y, height = 62, 221
    rounded_box(pdf, MARGIN, y, CONTENT_W, height)
    pdf.setFillColor(NAVY)
    pdf.setFont("GShop-Bold", 8.4)
    pdf.drawString(MARGIN + 16, y + height - 34, "Am ridicat produsul și confirm primirea acestuia în starea indicată mai sus.")
    inner_x = MARGIN + 16
    inner_width = CONTENT_W - 32
    draw_line_field(pdf, inner_x, y + height - 75, 198, "Nume client", client_name(data), label_width=68)
    draw_line_field(
        pdf,
        390,
        y + height - 75,
        162,
        "Data și ora",
        first_value(data, (("exit", "date"), ("sheet", "deliveredAt"))),
        label_width=62,
    )
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", 6.3)
    pdf.drawString(inner_x, y + height - 102, "ȘTAMPILĂ")
    signature_x = 390
    pdf.drawString(signature_x, y + height - 102, "SEMNĂTURĂ CLIENT")
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.85)
    pdf.line(signature_x, 145, signature_x + 102, 145)
    # Ștampila se aplică direct pe fundal, fără chenar ajutător.


def build_pdf(output: Path, data: dict[str, Any], show_company: bool) -> Path:
    register_fonts()
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    pdf.setTitle("Fișă de ieșire din service G-Shop")
    pdf.setAuthor("G-Shop")
    pdf.setSubject("Predare produs și confirmare client")
    pdf.setCreator("G-Shop service exit generator")
    draw_background(pdf)
    draw_header(pdf, data)
    if show_company:
        draw_company(pdf, data)
    pdf.saveState()
    if not show_company:
        pdf.translate(0, 48)
    draw_reference_band(pdf, data)
    draw_client_equipment(pdf, data)
    draw_defect(pdf, data)
    draw_product_state(pdf, data)
    draw_pickup(pdf, data)
    pdf.restoreState()
    draw_footer(pdf)
    pdf.showPage()
    pdf.save()
    return output


def load_data(path: Path | None) -> dict[str, Any]:
    if not path:
        return {}
    with path.open("r", encoding="utf-8") as stream:
        payload = json.load(stream)
    if not isinstance(payload, dict):
        raise ValueError("Fișierul JSON trebuie să conțină un obiect la nivelul principal.")
    return payload


def generate(output_root: Path, data: dict[str, Any], company_mode: str) -> list[Path]:
    if company_mode == "with":
        modes = (("cu-date-firma", True),)
    elif company_mode == "without":
        modes = (("fara-date-firma", False),)
    else:
        modes = (("cu-date-firma", True), ("fara-date-firma", False))
    outputs: list[Path] = []
    for folder, show_company in modes:
        output = output_root / folder / "fisa-iesire-din-service.pdf"
        outputs.append(build_pdf(output, data, show_company))
    return outputs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generează fișa de ieșire din service G-Shop.")
    parser.add_argument(
        "--data",
        type=Path,
        help="JSON opțional cu company, client, sheet, intake, estimate și exit.",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--company-mode", choices=("both", "with", "without"), default="both")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    for item in generate(args.output.resolve(), load_data(args.data), args.company_mode):
        print(item)
