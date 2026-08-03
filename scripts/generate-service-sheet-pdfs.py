from __future__ import annotations

import argparse
import base64
import json
from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Iterable

from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from PIL import Image as PILImage


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "output" / "pdf" / "fise-service-g-shop"
LOGO = ROOT / "api" / "assets" / "logo.png"

PAGE_W, PAGE_H = A4
MARGIN = 22
CONTENT_W = PAGE_W - 2 * MARGIN

# G-Shop design tokens (theme/tokens.ts).
ELECTRIC = HexColor("#075CFF")
ELECTRIC_DARK = HexColor("#0646C8")
ELECTRIC_LIGHT = HexColor("#EAF1FF")
NAVY = HexColor("#07152D")
SLATE = HexColor("#62718A")
LINE = HexColor("#E4EAF3")
CANVAS = HexColor("#F5F8FD")
SURFACE_MUTED = HexColor("#EEF3FA")
SUCCESS = HexColor("#14A83B")
SUCCESS_SOFT = HexColor("#E9F9ED")
WARNING = HexColor("#FF9F0A")
WARNING_SOFT = HexColor("#FFF4DE")
DANGER = HexColor("#E7354C")
DANGER_SOFT = HexColor("#FDECEF")
PURPLE = HexColor("#7C3AED")
CYAN = HexColor("#05A7C4")


@dataclass(frozen=True)
class Variant:
    filename: str
    rest_status: str | None
    total_status: str


VARIANTS = (
    Variant("1-rest-de-plata-achitat-total-achitat.pdf", "ACHITAT", "ACHITAT"),
    Variant("2-rest-de-plata-neachitat-total-neachitat.pdf", "NEACHITAT", "NEACHITAT"),
    Variant("3-total-achitat.pdf", None, "ACHITAT"),
    Variant("4-total-neachitat.pdf", None, "NEACHITAT"),
)


def register_fonts() -> None:
    regular_candidates = (
        Path(r"C:\Windows\Fonts\segoeui.ttf"),
        Path(r"C:\Windows\Fonts\arial.ttf"),
    )
    bold_candidates = (
        Path(r"C:\Windows\Fonts\segoeuib.ttf"),
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
    )
    regular = next((item for item in regular_candidates if item.exists()), None)
    bold = next((item for item in bold_candidates if item.exists()), None)
    if not regular or not bold:
        raise FileNotFoundError("Nu am găsit fonturile Windows necesare pentru diacritice.")
    if "GShop-Regular" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("GShop-Regular", str(regular)))
    if "GShop-Bold" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("GShop-Bold", str(bold)))


def text(data: dict[str, Any], *path: str, default: str = "") -> str:
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
        value = text(data, *path)
        if value:
            return value
    return ""


def money_display(value: str, currency: str) -> str:
    if value == "":
        return ""
    try:
        amount = float(value.replace(" ", "").replace(",", "."))
    except ValueError:
        return f"{value} {currency}".strip()
    formatted = f"{amount:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{formatted} {currency}".strip()


def date_time_display(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value
    return parsed.strftime("%d.%m.%Y, %H:%M")


def full_name(data: dict[str, Any]) -> str:
    return " ".join(
        value
        for value in (text(data, "client", "firstName"), text(data, "client", "lastName"))
        if value
    )


def full_address(data: dict[str, Any], root: str) -> str:
    return ", ".join(
        value
        for value in (
            text(data, root, "address"),
            text(data, root, "city"),
            text(data, root, "county"),
            text(data, root, "postalCode"),
            text(data, root, "country"),
        )
        if value
    )


def image_source(value: str | Path | None) -> ImageReader | None:
    if not value:
        return None
    if isinstance(value, Path):
        return ImageReader(str(value)) if value.exists() else None
    if value.startswith("data:image/") and "," in value:
        try:
            return ImageReader(BytesIO(base64.b64decode(value.split(",", 1)[1])))
        except (ValueError, TypeError):
            return None
    candidate = Path(value)
    return ImageReader(str(candidate)) if candidate.exists() else None


def rounded_box(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    *,
    radius: float = 9,
    fill: Color = white,
    stroke: Color = LINE,
    line_width: float = 0.85,
) -> None:
    c.setLineWidth(line_width)
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)


def draw_background(c: canvas.Canvas) -> None:
    c.setFillColor(CANVAS)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(HexColor("#EDF4FF"))
    c.circle(PAGE_W + 42, PAGE_H - 20, 98, fill=1, stroke=0)
    c.setFillColor(HexColor("#F1F6FF"))
    c.circle(-48, -28, 88, fill=1, stroke=0)


def draw_logo(c: canvas.Canvas, x: float, y: float, size: float = 45) -> None:
    if not LOGO.exists():
        return
    # Inline RGB rendering avoids a repeated transparent XObject disappearing on
    # page 2 in some PDF viewers while keeping the exact current G-Shop artwork.
    with PILImage.open(LOGO) as source:
        rgba = source.convert("RGBA")
        flattened = PILImage.new("RGB", rgba.size, "white")
        flattened.paste(rgba, mask=rgba.getchannel("A"))
        c.drawInlineImage(flattened, x, y, width=size, height=size, preserveAspectRatio=True)


def draw_header(c: canvas.Canvas, data: dict[str, Any], continuation: bool = False) -> None:
    y = 758
    rounded_box(c, MARGIN, y, CONTENT_W, 62, radius=13, fill=white, stroke=LINE)
    c.setFillColor(ELECTRIC)
    c.roundRect(MARGIN, y, 6, 62, 3, fill=1, stroke=0)
    draw_logo(c, MARGIN + 17, y + 8, 46)

    c.setFillColor(NAVY)
    c.setFont("GShop-Bold", 17.4)
    title = "FIȘĂ DE SERVICE"
    c.drawString(MARGIN + 76, y + 37, title)
    c.setFillColor(ELECTRIC_DARK)
    c.setFont("GShop-Bold", 7.4)
    property_name = first_value(data, (("company", "propertyName"), ("property", "name")))
    if property_name:
        property_label = f"G-SHOP | {property_name.upper()}"
        c.drawString(MARGIN + 76, y + 22, fit_text(property_label, "GShop-Bold", 7.4, 230 if not continuation else 420))

    if continuation:
        return

    info_x = PAGE_W - MARGIN - 230
    rounded_box(c, info_x, y + 10, 218, 42, radius=8, fill=ELECTRIC_LIGHT, stroke=HexColor("#B9D0FF"))
    values = (
        ("NR. FIȘĂ", text(data, "sheet", "number"), 10, 91, 9.2),
        ("DATA PRIMIRII", text(data, "sheet", "receivedAt"), 116, 91, 6.8),
    )
    for label_text, value, offset, width, value_size in values:
        c.setFillColor(ELECTRIC_DARK)
        c.setFont("GShop-Bold", 5.5)
        c.drawString(info_x + offset, y + 37, label_text)
        c.setFillColor(NAVY)
        c.setFont("GShop-Bold", value_size)
        c.drawString(info_x + offset, y + 21, fit_text(value, "GShop-Bold", value_size, width))
        c.setStrokeColor(HexColor("#9ABEFF"))
        c.line(info_x + offset, y + 18, info_x + offset + width, y + 18)


def draw_footer(c: canvas.Canvas, page: int, total: int) -> None:
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(MARGIN, 29, PAGE_W - MARGIN, 29)
    c.setFillColor(SLATE)
    c.setFont("GShop-Regular", 4.45)
    c.drawString(
        MARGIN,
        18,
        "În temeiul legii: OG 21/1992 | Legea 193/2000 | Codul civil | GDPR (UE) 2016/679 | Legea 190/2018.",
    )
    c.setFont("GShop-Bold", 5.5)
    c.drawCentredString(PAGE_W / 2, 9, f"Pagina {page}/{total}")
    c.setFillColor(ELECTRIC_DARK)
    c.drawRightString(PAGE_W - MARGIN, 9, "G-SHOP | FIȘĂ SERVICE")


def section_title(c: canvas.Canvas, y: float, number: int, title: str, subtitle: str = "") -> None:
    x = MARGIN + 3
    c.setFillColor(ELECTRIC)
    c.circle(x + 8, y + 8, 8, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("GShop-Bold", 7.3)
    c.drawCentredString(x + 8, y + 5.3, str(number))
    c.setFillColor(NAVY)
    c.setFont("GShop-Bold", 10.2)
    c.drawString(x + 22, y + 4.8, title)
    if subtitle:
        c.setFillColor(SLATE)
        c.setFont("GShop-Bold", 6.2)
        c.drawRightString(PAGE_W - MARGIN - 5, y + 5, subtitle)


def fit_text(value: str, font: str, size: float, width: float) -> str:
    if not value:
        return ""
    if pdfmetrics.stringWidth(value, font, size) <= width:
        return value
    suffix = "..."
    current = value
    while current and pdfmetrics.stringWidth(current + suffix, font, size) > width:
        current = current[:-1]
    return current.rstrip() + suffix


def wrap_text(value: str, font: str, size: float, width: float) -> list[str]:
    words = value.split()
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


def draw_line_field(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    label_text: str,
    value: str = "",
    *,
    label_size: float = 6.0,
    label_width: float | None = None,
) -> None:
    c.setFillColor(SLATE)
    c.setFont("GShop-Bold", label_size)
    c.drawString(x, y + 3, label_text.upper())
    label_w = label_width or (pdfmetrics.stringWidth(label_text.upper(), "GShop-Bold", label_size) + 7)
    line_x = min(x + label_w, x + w - 14)
    c.setStrokeColor(HexColor("#C8D3E3"))
    c.setLineWidth(0.85)
    c.line(line_x, y, x + w, y)
    if value:
        c.setFillColor(NAVY)
        c.setFont("GShop-Regular", 7.0)
        c.drawString(line_x + 4, y + 2.2, fit_text(value, "GShop-Regular", 7.0, x + w - line_x - 7))


def draw_narrative(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    label_text: str,
    value: str = "",
    *,
    lines: int = 3,
) -> None:
    c.setFillColor(SLATE)
    c.setFont("GShop-Bold", 6.1)
    c.drawString(x, y + h - 11, label_text.upper())
    text_top = y + h - 24
    if value:
        wrapped = wrap_text(value, "GShop-Regular", 7.0, w)
        c.setFillColor(NAVY)
        c.setFont("GShop-Regular", 7.0)
        for index, line in enumerate(wrapped[:lines]):
            c.drawString(x, text_top - index * 12, line)
    c.setStrokeColor(HexColor("#C8D3E3"))
    c.setLineWidth(0.75)
    for index in range(lines):
        line_y = text_top - 2 - index * 14
        c.line(x, line_y, x + w, line_y)


def checkbox(c: canvas.Canvas, x: float, y: float, label_text: str, checked: bool = False) -> None:
    size = 8
    c.setStrokeColor(SLATE)
    c.setLineWidth(0.8)
    c.roundRect(x, y - 1, size, size, 1.5, fill=0, stroke=1)
    if checked:
        c.setStrokeColor(ELECTRIC)
        c.setLineWidth(1.4)
        c.line(x + 1.5, y + 3, x + 3.5, y + 1)
        c.line(x + 3.5, y + 1, x + 7, y + 6.5)
    c.setFillColor(NAVY)
    c.setFont("GShop-Bold", 6.2)
    c.drawString(x + size + 4, y, label_text)


def status_badge(c: canvas.Canvas, x: float, y: float, status: str | None) -> None:
    if not status:
        return
    paid = status == "ACHITAT"
    fill = SUCCESS_SOFT if paid else DANGER_SOFT
    color = SUCCESS if paid else DANGER
    width = 43 if paid else 51
    c.setFillColor(fill)
    c.setStrokeColor(fill)
    c.roundRect(x, y, width, 12, 6, fill=1, stroke=0)
    c.setFillColor(color)
    c.setFont("GShop-Bold", 5.2)
    c.drawCentredString(x + width / 2, y + 3.3, status)


def financial_summary_card(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    label_text: str,
    value: str = "",
    *,
    fill: Color = SURFACE_MUTED,
    value_color: Color = ELECTRIC_DARK,
    status: str | None = None,
    dark: bool = False,
    accent: Color | None = None,
) -> None:
    stroke = fill if dark else (accent or LINE)
    rounded_box(c, x, y, w, 57, radius=9, fill=fill, stroke=stroke, line_width=0.8)
    if accent:
        c.setFillColor(accent)
        c.roundRect(x, y + 8, 3.5, 41, 1.75, fill=1, stroke=0)
    c.setFillColor(white if dark else SLATE)
    c.setFont("GShop-Bold", 5.8)
    c.drawString(x + 11, y + 40, label_text.upper())
    if status:
        status_width = 43 if status == "ACHITAT" else 51
        status_badge(c, x + w - status_width - 9, y + 35, status)
    if value:
        c.setFillColor(value_color)
        value_size = 12.2 if w >= 180 else 10.6
        c.setFont("GShop-Bold", value_size)
        c.drawString(x + 11, y + 13, fit_text(value, "GShop-Bold", value_size, w - 22))


def financial_detail(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    label_text: str,
    value: str = "",
) -> None:
    rounded_box(c, x, y, w, 30, radius=7, fill=SURFACE_MUTED, stroke=LINE, line_width=0.55)
    c.setFillColor(SLATE)
    c.setFont("GShop-Bold", 4.7)
    c.drawString(x + 8, y + 17, label_text.upper())
    if value:
        c.setFillColor(NAVY)
        c.setFont("GShop-Bold", 7.0)
        c.drawString(x + 8, y + 5, fit_text(value, "GShop-Bold", 7.0, w - 16))


def draw_company_field(
    c: canvas.Canvas,
    x: float,
    label_y: float,
    value_y: float,
    w: float,
    label_text: str,
    value: str = "",
    *,
    emphasized: bool = False,
    value_size: float = 7.0,
) -> None:
    c.setFillColor(ELECTRIC_DARK)
    c.setFont("GShop-Bold", 5.2)
    c.drawString(x, label_y, label_text.upper())
    if not value:
        return
    font = "GShop-Bold" if emphasized else "GShop-Regular"
    c.setFillColor(NAVY)
    c.setFont(font, value_size)
    c.drawString(x, value_y, fit_text(value, font, value_size, w))


def draw_company_block(c: canvas.Canvas, data: dict[str, Any]) -> None:
    y = 694
    rounded_box(
        c,
        MARGIN,
        y,
        CONTENT_W,
        52,
        radius=10,
        fill=white,
        stroke=HexColor("#B9D0FF"),
        line_width=1.0,
    )
    c.setFillColor(ELECTRIC)
    c.roundRect(MARGIN, y + 6, 4, 40, 2, fill=1, stroke=0)

    inner_left = MARGIN + 12
    inner_right = PAGE_W - MARGIN - 12
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(inner_left, 720, inner_right, 720)
    for separator_x in (259, 360):
        c.line(separator_x, 724, separator_x, 741)
    for separator_x in (292, 376):
        c.line(separator_x, 699, separator_x, 716)

    company = data.get("company", {}) if isinstance(data.get("company"), dict) else {}
    company_data = {"company": company}
    draw_company_field(c, 34, 735, 723, 216, "Denumire juridică", text(company_data, "company", "legalName"), emphasized=True, value_size=7.2)
    draw_company_field(c, 269, 735, 723, 82, "CUI / CIF", text(company_data, "company", "taxId"), emphasized=True, value_size=7.2)
    draw_company_field(c, 370, 735, 723, 181, "Registrul Comerțului", text(company_data, "company", "tradeRegisterNumber"), value_size=6.9)
    draw_company_field(c, 34, 709, 697, 249, "Sediu", full_address(company_data, "company"), value_size=6.8)
    draw_company_field(c, 302, 709, 697, 65, "Telefon", text(company_data, "company", "phone"), value_size=6.8)
    draw_company_field(c, 386, 709, 697, 165, "Email", text(company_data, "company", "email"), value_size=6.6)


def draw_client_and_equipment(c: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(c, 674, 1, "Client și echipament", "date preluate din G-Shop")
    y, h = 565, 96
    gap = 10
    w = (CONTENT_W - gap) / 2
    rounded_box(c, MARGIN, y, w, h)
    rounded_box(c, MARGIN + w + gap, y, w, h)

    left_x = MARGIN + 11
    left_w = w - 22
    aligned_label_w = 78
    draw_line_field(c, left_x, y + 73, left_w, "Nume client", full_name(data), label_width=aligned_label_w)
    draw_line_field(c, left_x, y + 56, left_w, "Telefon", text(data, "client", "phone"), label_width=aligned_label_w)
    draw_line_field(c, left_x, y + 39, left_w, "Telefon secundar", text(data, "client", "secondaryPhone"), label_size=5.6, label_width=aligned_label_w)
    draw_line_field(c, left_x, y + 22, left_w, "Email", text(data, "client", "email"), label_width=aligned_label_w)
    draw_line_field(c, left_x, y + 5, left_w, "Adresă", full_address(data, "client"), label_width=aligned_label_w)

    right_x = MARGIN + w + gap + 11
    right_w = w - 22
    draw_line_field(c, right_x, y + 73, right_w, "Tip echipament", text(data, "sheet", "equipment"), label_width=aligned_label_w)
    draw_line_field(c, right_x, y + 56, right_w, "Marcă", text(data, "sheet", "brand"), label_width=aligned_label_w)
    draw_line_field(c, right_x, y + 39, right_w, "Model", text(data, "sheet", "model"), label_width=aligned_label_w)
    draw_line_field(c, right_x, y + 22, right_w, "Serie", text(data, "sheet", "serialNumber"), label_width=aligned_label_w)
    draw_line_field(c, right_x, y + 5, right_w, "Accesorii predate", text(data, "sheet", "accessories"), label_size=5.5, label_width=aligned_label_w)


def draw_diagnostic(c: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(c, 546, 2, "Diagnostic și lucrări", "recepție, constatare și intervenție")
    y, h = 376, 157
    rounded_box(c, MARGIN, y, CONTENT_W, h)
    split_x = MARGIN + CONTENT_W * 0.5
    c.setStrokeColor(LINE)
    c.line(split_x, y + 11, split_x, y + h - 11)
    draw_narrative(c, MARGIN + 11, y + 14, CONTENT_W * 0.5 - 22, h - 26, "Problemă declarată", text(data, "sheet", "reportedIssue"), lines=8)
    right_x = split_x + 11
    right_w = CONTENT_W * 0.5 - 22
    draw_narrative(c, right_x, y + 88, right_w, 55, "Constatare tehnică", text(data, "sheet", "technicalAssessment"), lines=3)
    draw_narrative(c, right_x, y + 44, right_w, 42, "Lucrări efectuate", text(data, "sheet", "workPerformed"), lines=2)
    draw_narrative(c, right_x, y + 1, right_w, 42, "Piese utilizate / necesare", text(data, "sheet", "partsUsed"), lines=2)


def draw_financials(c: canvas.Canvas, data: dict[str, Any], variant: Variant) -> None:
    section_title(c, 349, 3, "Costuri și plată", "valorile pentru client")
    y, h = 213, 123
    rounded_box(c, MARGIN, y, CONTENT_W, h, fill=white)

    # The application is the single source of truth for currency. Blank print
    # templates intentionally leave this field empty instead of assuming RON.
    currency = first_value(data, (("financials", "currencyCode"), ("sheet", "currencyCode")))
    diagnostic = text(data, "financials", "diagnosticFee")
    parts = first_value(data, (("financials", "displayedPartsCost"), ("sheet", "partsCost")))
    labor = first_value(data, (("financials", "displayedLaborCost"), ("sheet", "laborCost")))
    discount = text(data, "financials", "discountPercent")
    received = first_value(data, (("summary", "receivedAmount"), ("financials", "advancePaid")))
    total = first_value(data, (("summary", "totalDue"), ("sheet", "totalCost")))
    rest = text(data, "summary", "remainingDue")

    total_display = money_display(total, currency)
    received_display = money_display(received, currency)
    rest_display = money_display(rest, currency)
    payment_status = variant.total_status
    paid = payment_status == "ACHITAT"
    summary = (
        ("Total de plată", total_display, ELECTRIC, white, payment_status, True, None, 207),
        ("Achitat", received_display, white, SUCCESS, None, False, SUCCESS, 143),
        ("Rest de plată", rest_display, white, SUCCESS if paid else WARNING, payment_status, False, SUCCESS if paid else WARNING, 163),
    )
    gap = 8
    x = MARGIN + 11
    for label_text, value, fill, value_color, status, dark, accent, card_w in summary:
        financial_summary_card(
            c,
            x,
            y + 54,
            card_w,
            label_text,
            value,
            fill=fill,
            value_color=value_color,
            status=status,
            dark=dark,
            accent=accent,
        )
        x += card_w + gap

    details = (
        ("Diagnostic", money_display(diagnostic, currency)),
        ("Piese", money_display(parts, currency)),
        ("Manoperă", money_display(labor, currency)),
        ("Reducere", f"{discount}%" if discount else ""),
        ("Monedă", currency),
    )
    detail_gap = 6
    detail_w = (CONTENT_W - 22 - detail_gap * 4) / 5
    x = MARGIN + 11
    for label_text, value in details:
        financial_detail(c, x, y + 12, detail_w, label_text, value)
        x += detail_w + detail_gap


def draw_planning(c: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(c, 196, 4, "Planificare și observații", "termene și mențiuni pentru dosarul service")
    y, h = 48, 135
    rounded_box(c, MARGIN, y, CONTENT_W, h)
    col_gap = 12
    field_w = (CONTENT_W - 22 - col_gap * 2) / 3
    x = MARGIN + 11
    dates = (
        ("Data primirii", text(data, "sheet", "receivedAt")),
        ("Termen estimat", text(data, "sheet", "estimatedAt")),
        ("Data finalizării", text(data, "sheet", "completedAt")),
    )
    for label_text, value in dates:
        draw_line_field(c, x, y + 108, field_w, label_text, value)
        x += field_w + col_gap
    draw_line_field(c, MARGIN + 11, y + 87, CONTENT_W - 22, "Tehnician", text(data, "sheet", "technicianName"))
    draw_narrative(c, MARGIN + 11, y + 8, CONTENT_W - 22, 65, "Observații client / service", text(data, "sheet", "handoverNotes"), lines=4)


TERMS_LEFT = (
    ("1", "Clientul declară că deține echipamentul sau este autorizat să îl predea și că datele comunicate sunt corecte."),
    ("2", "Predarea autorizează recepția, fotografierea stării, diagnosticul, demontarea necesară și testele tehnice."),
    ("3", "Devizul inițial este informativ. Lucrările ori piesele suplimentare se execută după acordul clientului."),
    ("4", "Termenul estimat se poate modifica din cauza pieselor indisponibile, defectelor ascunse sau incompatibilităților."),
)

TERMS_RIGHT = (
    ("5", "Pentru baterii lovite, umflate, inundate ori cu risc termic, service-ul poate opri testarea și recomanda reciclarea."),
    ("6", "Garanția lucrării și a pieselor este cea înscrisă în fișă, factură sau certificat și curge de la predare."),
    ("7", "Datele personale sunt folosite pentru service, comunicare, facturare, garanție și îndeplinirea obligațiilor legale."),
    ("8", "Aceste condiții nu limitează drepturile consumatorului. Litigiile pot fi soluționate amiabil ori prin căile legale."),
)


def draw_terms_column(
    c: canvas.Canvas,
    x: float,
    y_top: float,
    width: float,
    items: tuple[tuple[str, str], ...],
) -> None:
    y = y_top
    for number, item_text in items:
        c.setFillColor(ELECTRIC_DARK)
        c.setFont("GShop-Bold", 6.2)
        c.drawString(x, y, f"{number}.")
        lines = wrap_text(item_text, "GShop-Regular", 6.2, width - 18)
        c.setFillColor(NAVY)
        c.setFont("GShop-Regular", 6.2)
        for index, line in enumerate(lines):
            c.drawString(x + 18, y - index * 8, line)
        y -= len(lines) * 8 + 5


def draw_terms(c: canvas.Canvas) -> None:
    section_title(c, 718, 5, "Condiții service", "acceptate prin semnare")
    y, h = 586, 118
    rounded_box(c, MARGIN, y, CONTENT_W, h, fill=ELECTRIC_LIGHT, stroke=HexColor("#B9D0FF"))
    split = MARGIN + CONTENT_W / 2
    c.setStrokeColor(HexColor("#B9D0FF"))
    c.line(split, y + 12, split, y + h - 12)
    draw_terms_column(c, MARGIN + 12, y + h - 18, CONTENT_W / 2 - 24, TERMS_LEFT)
    draw_terms_column(c, split + 12, y + h - 18, CONTENT_W / 2 - 24, TERMS_RIGHT)
    c.setFillColor(SLATE)
    c.setFont("GShop-Regular", 4.8)
    c.drawString(MARGIN + 12, y + 8, "Repere: OG 21/1992, Legea 193/2000, Regulamentul (UE) 2016/679 și Legea 190/2018.")


def draw_handover(c: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(c, 561, 6, "Acord și predare", "confirmarea lucrării și a stării finale")
    y, h = 449, 98
    rounded_box(c, MARGIN, y, CONTENT_W, h)
    checkbox_labels = (
        ("approveDiagnostics", "Aprob diagnosticul și testarea"),
        ("approveRepair", "Aprob reparația / devizul"),
        ("repairRefused", "Refuz reparația"),
        ("productDelivered", "Produs predat"),
    )
    grid_x = MARGIN + 12
    grid_w = CONTENT_W - 24
    column_w = grid_w / 4
    sheet = data.get("sheet", {}) if isinstance(data.get("sheet"), dict) else {}
    for column_index, (key, label_text) in enumerate(checkbox_labels):
        checkbox(c, grid_x + column_index * column_w, y + 68, label_text, bool(sheet.get(key)))
    draw_line_field(c, MARGIN + 12, y + 36, 160, "Garanție", text(data, "sheet", "warranty"))
    draw_line_field(c, MARGIN + 192, y + 36, 150, "Depozitare după", text(data, "sheet", "storageAfter"))
    draw_line_field(c, MARGIN + 362, y + 36, CONTENT_W - 374, "Status final", text(data, "sheet", "status"))
    draw_line_field(c, MARGIN + 12, y + 13, CONTENT_W - 24, "Mențiuni la predare", text(data, "sheet", "handoverNotes"))


def draw_signatures(c: canvas.Canvas, data: dict[str, Any], show_company: bool) -> None:
    section_title(c, 424, 7, "Semnături", "confirmarea clientului și identificarea tehnicianului")
    y, h = 271, 140
    rounded_box(c, MARGIN, y, CONTENT_W, h)
    split = MARGIN + CONTENT_W * 0.63
    c.setStrokeColor(LINE)
    c.line(split, y + 14, split, y + h - 14)

    left_x = MARGIN + 12
    left_w = split - left_x - 12
    right_x = split + 12
    right_w = PAGE_W - MARGIN - right_x - 12
    draw_line_field(c, left_x, y + 106, left_w, "Nume client", full_name(data))
    draw_line_field(c, left_x, y + 82, left_w, "Data / ora", date_time_display(text(data, "sheet", "signedAt")))
    draw_line_field(c, right_x, y + 106, right_w, "Tehnician", text(data, "sheet", "technicianName"))
    c.setFillColor(SLATE)
    c.setFont("GShop-Bold", 6.0)
    if show_company:
        c.drawString(left_x, y + 68, "ȘTAMPILĂ")
        stamp = image_source(text(data, "company", "stampUrl"))
        if stamp:
            c.drawImage(stamp, left_x, y + 10, width=96, height=50, preserveAspectRatio=True, mask="auto")

    c.drawString(right_x, y + 68, "SEMNĂTURĂ CLIENT")
    signature = image_source(text(data, "sheet", "signatureUrl"))
    sheet = data.get("sheet", {}) if isinstance(data.get("sheet"), dict) else {}
    if signature:
        c.drawImage(signature, right_x, y + 16, width=right_w, height=38, preserveAspectRatio=True, mask="auto")
    elif sheet.get("demoSignature"):
        c.saveState()
        c.setStrokeColor(ELECTRIC_DARK)
        c.setLineWidth(1.35)
        signature_path = c.beginPath()
        signature_path.moveTo(right_x + 10, y + 28)
        signature_path.curveTo(right_x + 28, y + 48, right_x + 30, y + 18, right_x + 48, y + 36)
        signature_path.curveTo(right_x + 64, y + 48, right_x + 66, y + 18, right_x + 82, y + 32)
        signature_path.curveTo(right_x + 98, y + 44, right_x + 110, y + 21, right_x + min(right_w - 8, 134), y + 29)
        c.drawPath(signature_path, fill=0, stroke=1)
        c.setLineWidth(0.8)
        c.line(right_x, y + 23, right_x + right_w, y + 23)
        c.restoreState()
    else:
        c.setStrokeColor(HexColor("#C8D3E3"))
        c.line(right_x, y + 16, right_x + right_w, y + 16)


def build_pdf(output: Path, data: dict[str, Any], variant: Variant, show_company: bool) -> Path:
    register_fonts()
    output.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    c.setTitle("Fișă de service G-Shop")
    c.setAuthor("G-Shop")
    c.setSubject("Recepție, diagnostic, lucrări, costuri și predare echipament")
    c.setCreator("G-Shop service sheet generator")

    draw_background(c)
    draw_header(c, data)
    if show_company:
        draw_company_block(c, data)
    c.saveState()
    if not show_company:
        c.translate(0, 48)
    draw_client_and_equipment(c, data)
    draw_diagnostic(c, data)
    draw_financials(c, data, variant)
    draw_planning(c, data)
    c.restoreState()
    draw_footer(c, 1, 2)
    c.showPage()

    draw_background(c)
    draw_header(c, data, continuation=True)
    draw_terms(c)
    draw_handover(c, data)
    draw_signatures(c, data, show_company)
    draw_footer(c, 2, 2)
    c.showPage()
    c.save()
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
    outputs: list[Path] = []
    modes: tuple[tuple[str, bool], ...]
    if company_mode == "with":
        modes = (("cu-date-firma", True),)
    elif company_mode == "without":
        modes = (("fara-date-firma", False),)
    else:
        modes = (("cu-date-firma", True), ("fara-date-firma", False))
    for folder, show_company in modes:
        for variant in VARIANTS:
            outputs.append(build_pdf(output_root / folder / variant.filename, data, variant, show_company))
    return outputs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generează variantele fișei de service G-Shop.")
    parser.add_argument("--data", type=Path, help="JSON opțional cu obiectele company, client, sheet, financials și summary.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Directorul pachetului PDF.")
    parser.add_argument("--company-mode", choices=("both", "with", "without"), default="both")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    result = generate(args.output.resolve(), load_data(args.data), args.company_mode)
    for item in result:
        print(item)
