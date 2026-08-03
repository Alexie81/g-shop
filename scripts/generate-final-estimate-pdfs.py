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
DEFAULT_OUTPUT = ROOT / "output" / "pdf" / "devize-finale-g-shop"
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
SURFACE_MUTED = HexColor("#EEF3FA")
SUCCESS = HexColor("#14A83B")
WARNING = HexColor("#FF9F0A")
DANGER = HexColor("#E7354C")
SUCCESS_SOFT = HexColor("#E4F8E8")
DANGER_SOFT = HexColor("#FDEBEE")


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


def money_display(field_value: Any, currency: str) -> str:
    if field_value is None:
        return ""
    raw_value = str(field_value).strip()
    if not raw_value:
        return ""
    normalized = raw_value.replace(" ", "")
    if "," in normalized and "." in normalized:
        if normalized.rfind(",") > normalized.rfind("."):
            normalized = normalized.replace(".", "").replace(",", ".")
        else:
            normalized = normalized.replace(",", "")
    elif "," in normalized:
        normalized = normalized.replace(",", ".")
    try:
        amount = float(normalized)
    except ValueError:
        return f"{raw_value} {currency}".strip()
    formatted = f"{amount:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{formatted} {currency}".strip()


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


def draw_rich_paragraph(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    segments: list[tuple[str, bool]],
    *,
    size: float,
    line_height: float,
    max_lines: int,
) -> int:
    tokens: list[tuple[str, str]] = []
    for segment_text, bold in segments:
        font = "GShop-Bold" if bold else "GShop-Regular"
        tokens.extend((word, font) for word in segment_text.split() if word)
    lines: list[list[tuple[str, str, float, float]]] = [[]]
    widths = [0.0]
    for word, font in tokens:
        word_width = pdfmetrics.stringWidth(word, font, size)
        space_width = pdfmetrics.stringWidth(" ", "GShop-Regular", size) if lines[-1] else 0.0
        if lines[-1] and widths[-1] + space_width + word_width > width:
            if len(lines) >= max_lines:
                break
            lines.append([])
            widths.append(0.0)
            space_width = 0.0
        lines[-1].append((word, font, space_width, word_width))
        widths[-1] += space_width + word_width
    pdf.setFillColor(NAVY)
    for line_index, line in enumerate(lines):
        cursor_x = x
        baseline = y - line_index * line_height
        for word, font, space_width, word_width in line:
            cursor_x += space_width
            pdf.setFont(font, size)
            pdf.drawString(cursor_x, baseline, word)
            cursor_x += word_width
    return len(lines)


def final_number(data: dict[str, Any]) -> str:
    return first_value(data, (("estimate", "number"), ("sheet", "finalEstimateNumber")))


def final_date(data: dict[str, Any]) -> str:
    return first_value(data, (("estimate", "date"), ("sheet", "finalEstimateAt")))


def intake_number(data: dict[str, Any]) -> str:
    return first_value(data, (("intake", "number"), ("sheet", "number")))


def intake_date(data: dict[str, Any]) -> str:
    return first_value(data, (("intake", "date"), ("sheet", "receivedAt")))


def draw_header(pdf: canvas.Canvas, data: dict[str, Any], continuation: bool = False) -> None:
    y = 758
    rounded_box(pdf, MARGIN, y, CONTENT_W, 62, radius=13)
    pdf.setFillColor(ELECTRIC)
    pdf.roundRect(MARGIN, y, 6, 62, 3, fill=1, stroke=0)
    draw_logo(pdf, MARGIN + 17, y + 8, 46)
    pdf.setFillColor(NAVY)
    pdf.setFont("GShop-Bold", 16.3)
    pdf.drawString(MARGIN + 76, y + 38, "DEVIZ FINAL")
    pdf.setFillColor(ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 7.4)
    pdf.drawString(MARGIN + 76, y + 22, "DIAGNOSTIC, PIESE ȘI MANOPERĂ | G-SHOP")

    info_x = PAGE_W - MARGIN - 230
    rounded_box(pdf, info_x, y + 10, 218, 42, radius=8, fill=ELECTRIC_LIGHT, stroke=HexColor("#B9D0FF"))
    fields = (
        ("NR. DEVIZ", final_number(data), 10, 91),
        ("DATA", final_date(data), 116, 91),
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


def draw_footer(pdf: canvas.Canvas, page: int, total: int) -> None:
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
    pdf.drawCentredString(PAGE_W / 2, 18, f"Pagina {page}/{total}")
    pdf.setFillColor(ELECTRIC_DARK)
    pdf.drawRightString(PAGE_W - MARGIN, 18, "G-SHOP | DEVIZ FINAL")


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


def draw_reference_band(pdf: canvas.Canvas, data: dict[str, Any], y: float) -> None:
    rounded_box(pdf, MARGIN, y, CONTENT_W, 22, radius=7, fill=ELECTRIC_LIGHT, stroke=HexColor("#B9D0FF"))
    draw_line_field(
        pdf,
        MARGIN + 11,
        y + 6,
        (CONTENT_W - 32) * 0.58,
        "Pentru fișa de intrare în service nr.",
        intake_number(data),
        label_size=5.5,
    )
    draw_line_field(
        pdf,
        MARGIN + 21 + (CONTENT_W - 32) * 0.58,
        y + 6,
        (CONTENT_W - 32) * 0.42,
        "Din data",
        intake_date(data),
        label_size=5.5,
    )


def draw_narrative_box(pdf: canvas.Canvas, x: float, y: float, width: float, height: float, text: str, rows: int) -> None:
    rounded_box(pdf, x, y, width, height)
    inner_x = x + 11
    inner_width = width - 22
    if text:
        lines = wrap_text(text, "GShop-Regular", 7.0, inner_width)
        pdf.setFillColor(NAVY)
        pdf.setFont("GShop-Regular", 7.0)
        for index, line in enumerate(lines[:rows]):
            pdf.drawString(inner_x, y + height - 17 - index * 12, line)
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.75)
    for index in range(rows):
        line_y = y + height - 20 - index * ((height - 16) / rows)
        pdf.line(inner_x, line_y, inner_x + inner_width, line_y)


def normalize_items(data: dict[str, Any], kind: str) -> list[dict[str, str]]:
    candidates: Any = data.get(kind)
    if not isinstance(candidates, list):
        candidates = data.get("sheet", {}).get(f"{kind}Items") if isinstance(data.get("sheet"), dict) else None
    if not isinstance(candidates, list):
        return []
    result: list[dict[str, str]] = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        name = "" if item.get("name", item.get("description")) is None else str(item.get("name", item.get("description", ""))).strip()
        quantity = "" if item.get("quantity") is None else str(item.get("quantity", "")).strip()
        unit_price = "" if item.get("unitPrice") is None else str(item.get("unitPrice", "")).strip()
        raw_total = item.get("totalPrice", item.get("total", ""))
        total = "" if raw_total is None else str(raw_total).strip()
        # directCost is intentionally ignored: it is an internal cost and must
        # never appear in the client-facing estimate.
        if not any((name, quantity, unit_price, total)):
            continue
        if total in (None, ""):
            try:
                total = float(quantity) * float(unit_price)
            except (TypeError, ValueError):
                total = ""
        result.append(
            {
                "name": name,
                "quantity": quantity,
                "unitPrice": unit_price,
                "total": str(total),
            }
        )
    return result


TABLE_HEADER_HEIGHT = 18
TABLE_ROW_HEIGHT = 17
EMPTY_TABLE_HEIGHT = 28


def draw_items_table(pdf: canvas.Canvas, x: float, y: float, width: float, items: list[dict[str, str]]) -> None:
    header_height = 18
    row_height = 17
    height = header_height + len(items) * row_height
    rounded_box(pdf, x, y, width, height, radius=8)
    columns = (width * 0.53, width * 0.12, width * 0.17, width * 0.18)
    labels = ("Denumire", "Cantitate", "Preț unitar", "Preț total")
    pdf.setFillColor(ELECTRIC_LIGHT)
    pdf.roundRect(x, y + height - header_height, width, header_height, 8, fill=1, stroke=0)
    pdf.rect(x, y + height - header_height, width, header_height - 8, fill=1, stroke=0)
    cursor_x = x
    for label, column_width in zip(labels, columns):
        pdf.setFillColor(ELECTRIC_DARK)
        pdf.setFont("GShop-Bold", 5.7)
        pdf.drawCentredString(cursor_x + column_width / 2, y + height - 12, label.upper())
        cursor_x += column_width
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.7)
    cursor_x = x
    for column_width in columns[:-1]:
        cursor_x += column_width
        pdf.line(cursor_x, y, cursor_x, y + height)
    for row in range(len(items)):
        row_y = y + row * row_height
        pdf.line(x, row_y, x + width, row_y)
    for display_row, item in enumerate(items):
        baseline = y + height - header_height - (display_row + 1) * row_height + 5
        cursor_x = x
        values = (
            str(item.get("name", "")),
            str(item.get("quantity", "")),
            str(item.get("unitPrice", "")),
            str(item.get("total", "")),
        )
        for index, (cell_value, column_width) in enumerate(zip(values, columns)):
            pdf.setFillColor(NAVY)
            pdf.setFont("GShop-Regular", 6.1)
            fitted = fit_text(cell_value, "GShop-Regular", 6.1, column_width - 8)
            if index == 0:
                pdf.drawString(cursor_x + 4, baseline, fitted)
            else:
                pdf.drawRightString(cursor_x + column_width - 4, baseline, fitted)
            cursor_x += column_width


def draw_empty_items(pdf: canvas.Canvas, x: float, y: float, width: float, label: str) -> None:
    rounded_box(pdf, x, y, width, EMPTY_TABLE_HEIGHT, radius=8, fill=SURFACE_MUTED, stroke=LINE, line_width=0.6)
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Regular", 6.8)
    pdf.drawCentredString(x + width / 2, y + 10, label)


def financial_summary_card(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    label: str,
    field_value: str = "",
    *,
    fill: Color = white,
    value_color: Color = NAVY,
    dark: bool = False,
    accent: Color | None = None,
    height: float = 57,
    status: str | None = None,
) -> None:
    rounded_box(
        pdf,
        x,
        y,
        width,
        height,
        radius=9,
        fill=fill,
        stroke=fill if dark else (accent or LINE),
        line_width=0.8,
    )
    if accent:
        pdf.setFillColor(accent)
        pdf.roundRect(x, y + 8, 3.5, max(8, height - 16), 1.75, fill=1, stroke=0)
    pdf.setFillColor(white if dark else SLATE)
    pdf.setFont("GShop-Bold", 5.8)
    label_width = width - 22 - ((43 if status == "ACHITAT" else 51) + 7 if status else 0)
    pdf.drawString(x + 11, y + height - 17, fit_text(label.upper(), "GShop-Bold", 5.8, label_width))
    if status:
        paid_status = status == "ACHITAT"
        status_width = 43 if paid_status else 51
        badge_x = x + width - status_width - 9
        pdf.setFillColor(SUCCESS_SOFT if paid_status else DANGER_SOFT)
        pdf.roundRect(badge_x, y + height - 22, status_width, 12, 6, fill=1, stroke=0)
        pdf.setFillColor(SUCCESS if paid_status else DANGER)
        pdf.setFont("GShop-Bold", 5.2)
        pdf.drawCentredString(badge_x + status_width / 2, y + height - 18.7, status)
    if field_value:
        value_size = 12.2 if width >= 180 else 10.6
        pdf.setFillColor(value_color)
        pdf.setFont("GShop-Bold", value_size)
        pdf.drawString(x + 11, y + (19 if height >= 70 else 13), fit_text(field_value, "GShop-Bold", value_size, width - 22))


def financial_detail(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    label: str,
    field_value: str = "",
) -> None:
    rounded_box(pdf, x, y, width, 30, radius=7, fill=SURFACE_MUTED, stroke=LINE, line_width=0.55)
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", 4.7)
    pdf.drawString(x + 8, y + 17, label.upper())
    if field_value:
        pdf.setFillColor(NAVY)
        pdf.setFont("GShop-Bold", 7.0)
        pdf.drawString(x + 8, y + 5, fit_text(field_value, "GShop-Bold", 7.0, width - 16))


def numeric_amount(field_value: Any) -> float:
    raw = str(field_value or "").strip().replace("%", "").replace(" ", "")
    if not raw:
        return 0.0
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".") if raw.rfind(",") > raw.rfind(".") else raw.replace(",", "")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        return max(0.0, float(raw))
    except ValueError:
        return 0.0


def payment_total_values(data: dict[str, Any], total: str, paid: str, remaining: str, diagnostic: str, parts: str, labor: str) -> tuple[float, float, bool, str, str | None]:
    total_value = numeric_amount(total)
    discount_percent = numeric_amount(value(data, "financials", "discountPercent"))
    discount_amount = numeric_amount(value(data, "summary", "discountAmount"))
    has_discount = discount_percent > 0.0001 or discount_amount > 0.004
    before_discount = numeric_amount(value(data, "summary", "subtotal"))
    if before_discount <= 0 and discount_amount > 0:
        before_discount = total_value + discount_amount
    component_total = numeric_amount(diagnostic) + numeric_amount(parts) + numeric_amount(labor)
    if before_discount <= 0 and has_discount and component_total > 0:
        before_discount = component_total
    if before_discount <= 0 and has_discount and discount_percent < 100:
        before_discount = total_value / max(0.0001, 1 - discount_percent / 100)
    if not has_discount or before_discount < total_value:
        before_discount = total_value
    paid_value = numeric_amount(paid)
    remaining_value = numeric_amount(remaining)
    payment_status = value(data, "financials", "paymentStatus").upper()
    total_paid = total_value > 0 and (payment_status == "PAID" or remaining_value <= 0.009 or paid_value >= total_value - 0.009)
    total_status = "ACHITAT" if total_paid else "NEACHITAT"
    rest_status = ("ACHITAT" if remaining_value <= 0.009 else "NEACHITAT") if paid_value > 0.009 else None
    return before_discount, total_value, has_discount, total_status, rest_status


def payment_total_cards(pdf: canvas.Canvas, x: float, y: float, width: float, height: float, before_discount: float, total: float, has_discount: bool, currency: str, total_status: str) -> None:
    if not has_discount:
        financial_summary_card(pdf, x, y, width, "Total de plată", money_display(total, currency), fill=ELECTRIC, value_color=white, dark=True, height=height, status=total_status)
        return
    gap = 7.0
    card_height = (height - gap) / 2
    for index, (label, amount) in enumerate((("Total estimativ fără reducere", before_discount), ("Total de plată cu reducere", total))):
        bottom = y + (card_height + gap if index == 0 else 0)
        rounded_box(pdf, x, bottom, width, card_height, radius=8, fill=ELECTRIC, stroke=ELECTRIC, line_width=0.8)
        pdf.setFillColor(white)
        pdf.setFont("GShop-Bold", 4.8)
        label_width = width - 20 - ((50 if total_status == "ACHITAT" else 58) if index == 1 else 0)
        pdf.drawString(x + 10, bottom + card_height - 12, fit_text(label.upper(), "GShop-Bold", 4.8, label_width))
        shown = money_display(amount, currency)
        pdf.setFont("GShop-Bold", 8.8)
        pdf.drawString(x + 10, bottom + 8, fit_text(shown, "GShop-Bold", 8.8, width - 20))
        if index == 1:
            paid_status = total_status == "ACHITAT"
            status_width = 43 if paid_status else 51
            badge_x = x + width - status_width - 8
            pdf.setFillColor(SUCCESS_SOFT if paid_status else DANGER_SOFT)
            pdf.roundRect(badge_x, bottom + card_height - 17, status_width, 12, 6, fill=1, stroke=0)
            pdf.setFillColor(SUCCESS if paid_status else DANGER)
            pdf.setFont("GShop-Bold", 5.2)
            pdf.drawCentredString(badge_x + status_width / 2, bottom + card_height - 13.7, total_status)


def draw_totals(pdf: canvas.Canvas, data: dict[str, Any], y: float, template_mode: bool = False) -> None:
    height = 143
    rounded_box(pdf, MARGIN, y, CONTENT_W, height)
    inner_x = MARGIN + 11
    inner_width = CONTENT_W - 22
    total = "" if template_mode else first_value(data, (("summary", "totalDue"), ("estimate", "total"), ("sheet", "totalCost")))
    paid = "" if template_mode else first_value(data, (("summary", "receivedAmount"), ("financials", "advancePaid")))
    remaining = "" if template_mode else first_value(data, (("summary", "remainingDue"), ("estimate", "remaining")))
    diagnostic = "" if template_mode else value(data, "financials", "diagnosticFee")
    parts = "" if template_mode else first_value(data, (("financials", "displayedPartsCost"), ("sheet", "partsCost")))
    labor = "" if template_mode else first_value(data, (("financials", "displayedLaborCost"), ("sheet", "laborCost")))
    discount = "" if template_mode else value(data, "financials", "discountPercent")
    currency = "" if template_mode else first_value(data, (("financials", "currencyCode"), ("sheet", "currencyCode")))

    gap = 8
    summary_widths = (207.0, 143.0, inner_width - 207.0 - 143.0 - gap * 2)
    before_discount, total_value, has_discount, total_status, rest_status = payment_total_values(data, total, paid, remaining, diagnostic, parts, labor)
    payment_total_cards(pdf, inner_x, y + 51, summary_widths[0], 82, before_discount, total_value, has_discount, currency, total_status)
    x = inner_x + summary_widths[0] + gap
    for label, field_value, width, fill, value_color, dark, accent in (
        ("Achitat", money_display(paid, currency), summary_widths[1], white, SUCCESS, False, SUCCESS),
        ("Rest de plată", money_display(remaining, currency), summary_widths[2], white, SUCCESS if numeric_amount(remaining) <= 0.009 else WARNING, False, SUCCESS if numeric_amount(remaining) <= 0.009 else WARNING),
    ):
        financial_summary_card(
            pdf,
            x,
            y + 51,
            width,
            label,
            field_value,
            fill=fill,
            value_color=value_color,
            dark=dark,
            accent=accent,
            height=82,
            status=rest_status if label == "Rest de plată" else None,
        )
        x += width + gap

    small_gap = 6
    currency_width = max(
        38.0,
        pdfmetrics.stringWidth("MONEDĂ", "GShop-Bold", 4.7) + 16,
        pdfmetrics.stringWidth(currency, "GShop-Bold", 7.0) + 16 if currency else 0,
    )
    regular_width = (inner_width - currency_width - small_gap * 4) / 4
    x = inner_x
    for label, field_value, width in (
        ("Diagnostic", money_display(diagnostic, currency), regular_width),
        ("Piese", money_display(parts, currency), regular_width),
        ("Manoperă", money_display(labor, currency), regular_width),
        ("Reducere", f"{discount}%" if discount and not discount.endswith("%") else discount, regular_width),
        ("Monedă", currency, currency_width),
    ):
        financial_detail(pdf, x, y + 10, width, label, field_value)
        x += width + small_gap


def checkbox(pdf: canvas.Canvas, x: float, y: float, label: str, checked: bool = False, color: Color = ELECTRIC) -> None:
    size = 9
    pdf.setStrokeColor(SLATE)
    pdf.setLineWidth(0.9)
    pdf.roundRect(x, y - 1, size, size, 1.5, fill=0, stroke=1)
    if checked:
        pdf.setStrokeColor(color)
        pdf.setLineWidth(1.5)
        pdf.line(x + 1.5, y + 3, x + 3.8, y + 1)
        pdf.line(x + 3.8, y + 1, x + 7.8, y + 7)
    pdf.setFillColor(NAVY)
    pdf.setFont("GShop-Bold", 6.3)
    pdf.drawString(x + size + 4, y, label)


def draw_observations(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(pdf, 696, 6, "Observații finale", "cauza defectului și mențiuni")
    y, height = 548, 135
    rounded_box(pdf, MARGIN, y, CONTENT_W, height)
    cause = value(data, "sheet", "defectCause").upper()
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", 6.2)
    pdf.drawString(MARGIN + 11, y + height - 20, "CAUZA DEFECTULUI")
    checkbox(pdf, MARGIN + 118, y + height - 23, "Client", cause == "CLIENT")
    checkbox(pdf, MARGIN + 206, y + height - 23, "Producător", cause in ("PRODUCER", "MANUFACTURER"))
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", 6.1)
    pdf.drawString(MARGIN + 11, y + height - 49, "ALTE OBSERVAȚII")
    notes = value(data, "sheet", "finalNotes")
    inner_x = MARGIN + 11
    inner_width = CONTENT_W - 22
    if notes:
        lines = wrap_text(notes, "GShop-Regular", 7.0, inner_width)
        pdf.setFillColor(NAVY)
        pdf.setFont("GShop-Regular", 7.0)
        for index, line in enumerate(lines[:5]):
            pdf.drawString(inner_x, y + height - 64 - index * 13, line)
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.75)
    for index in range(5):
        line_y = y + height - 66 - index * 14
        pdf.line(inner_x, line_y, inner_x + inner_width, line_y)


def draw_term(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(pdf, 521, 7, "Termen estimat", "calculat de la acordul final")
    y, height = 462, 46
    rounded_box(pdf, MARGIN, y, CONTENT_W, height, fill=ELECTRIC_LIGHT, stroke=HexColor("#B9D0FF"))
    days = value(data, "sheet", "estimatedRepairDays")
    agreement_date = first_value(data, (("agreement", "date"), ("sheet", "finalAgreementAt")))
    label_x = MARGIN + 12
    line_x = label_x + 75
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", 5.7)
    pdf.drawString(label_x, y + 19, "TERMEN ESTIMAT")
    pdf.setFont("GShop-Bold", 7.2)
    days_line_width = max(18.0, min(60.0, pdfmetrics.stringWidth(days, "GShop-Bold", 7.2) + 10))
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.8)
    pdf.line(line_x, y + 16, line_x + days_line_width, y + 16)
    if days:
        pdf.setFillColor(NAVY)
        pdf.setFont("GShop-Bold", 7.2)
        pdf.drawString(line_x + 4, y + 18, days)
    pdf.setFillColor(NAVY)
    pdf.setFont("GShop-Regular", 7.0)
    pdf.drawString(line_x + days_line_width + 9, y + 19, "zile de la data acordului final al clientului")
    if agreement_date:
        pdf.setFillColor(SLATE)
        pdf.setFont("GShop-Bold", 5.4)
        pdf.drawRightString(PAGE_W - MARGIN - 12, y + 7, fit_text(agreement_date, "GShop-Bold", 5.4, 100))


def draw_stamp_placeholder(pdf: canvas.Canvas, x: float, y: float, width: float, height: float) -> None:
    pdf.setStrokeColor(HexColor("#A9B8CC"))
    pdf.setLineWidth(0.8)
    pdf.setDash(3, 2)
    pdf.roundRect(x, y, width, height, 7, fill=0, stroke=1)
    pdf.setDash()


def draw_final_agreement(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(pdf, 435, 8, "Acord final client", "acceptarea devizului și a termenului")
    y, height = 48, 374
    rounded_box(pdf, MARGIN, y, CONTENT_W, height)
    agreement_name = client_name(data)
    status = value(data, "agreement", "status").upper()
    if status in ("AGREE", "ACCEPTED"):
        decision = "SUNT DE ACORD"
    elif status in ("DISAGREE", "REJECTED", "REFUSED"):
        decision = "NU SUNT DE ACORD"
    else:
        decision = "ACORD NEEXPRIMAT"
    rounded_box(pdf, MARGIN + 11, y + height - 91, CONTENT_W - 22, 73, radius=8, fill=ELECTRIC_LIGHT, stroke=HexColor("#B9D0FF"))
    if data.get("templateMode") is not True:
        draw_rich_paragraph(
            pdf,
            MARGIN + 23,
            y + height - 42,
            CONTENT_W - 46,
            [
                (f"Subsemnatul/a {agreement_name or 'Clientul'} declar că", False),
                (decision, True),
                ("cu devizul final, care include costurile de diagnosticare și reparare a produsului meu / produselor mele, precum și cu termenul estimat de reparație.", False),
            ],
            size=8.2,
            line_height=12,
            max_lines=4,
        )

    checkbox(pdf, MARGIN + 22, y + height - 125, "SUNT DE ACORD", status in ("AGREE", "ACCEPTED"), SUCCESS)
    checkbox(pdf, MARGIN + 168, y + height - 125, "NU SUNT DE ACORD", status in ("DISAGREE", "REJECTED", "REFUSED"), DANGER)
    draw_line_field(pdf, MARGIN + 22, y + height - 163, 198, "Nume client", agreement_name, label_width=68)
    draw_line_field(
        pdf,
        370,
        y + height - 163,
        158,
        "Data / ora",
        first_value(data, (("agreement", "date"), ("sheet", "finalAgreementAt"))),
        label_width=58,
    )
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", 6.2)
    pdf.drawString(MARGIN + 22, y + height - 188, "SEMNĂTURĂ CLIENT")
    stamp_x = 370
    pdf.drawString(stamp_x, y + height - 188, "ȘTAMPILĂ")
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.85)
    pdf.line(MARGIN + 22, 195, MARGIN + 124, 195)
    # Ștampila se aplică direct pe fundal, fără chenar ajutător.


TITLE_TO_CONTENT = 13
SECTION_SPACING = 26
CONTENT_BOTTOM = 48
TOTALS_HEIGHT = 143


def item_block_height(row_count: int) -> float:
    content_height = TABLE_HEADER_HEIGHT + row_count * TABLE_ROW_HEIGHT if row_count else EMPTY_TABLE_HEIGHT
    return TITLE_TO_CONTENT + content_height + SECTION_SPACING


def plan_item_pages(data: dict[str, Any], show_company: bool) -> list[dict[str, Any]]:
    pages: list[dict[str, Any]] = []

    def add_page(first: bool) -> dict[str, Any]:
        page = {
            "first": first,
            "top": 474 + (48 if first and not show_company else 0) if first else 696,
            "sections": [],
            "totals": False,
        }
        pages.append(page)
        return page

    page = add_page(True)
    cursor = float(page["top"])
    section_specs = (
        (3, "Piese înlocuite", "denumire, cantitate și preț", "parts", "Nu au fost înregistrate piese."),
        (4, "Manoperă", "operațiuni și costuri", "labor", "Nu au fost înregistrate operațiuni de manoperă."),
    )
    for number, title, subtitle, kind, empty_label in section_specs:
        items = normalize_items(data, kind)
        if not items:
            required = item_block_height(0)
            if cursor - required < CONTENT_BOTTOM:
                page = add_page(False)
                cursor = float(page["top"])
            page["sections"].append(
                {
                    "number": number,
                    "title": title,
                    "subtitle": subtitle,
                    "items": [],
                    "emptyLabel": empty_label,
                    "continued": False,
                }
            )
            cursor -= required
            continue

        index = 0
        continued = False
        while index < len(items):
            maximum_rows = int(
                (cursor - CONTENT_BOTTOM - TITLE_TO_CONTENT - TABLE_HEADER_HEIGHT - SECTION_SPACING)
                // TABLE_ROW_HEIGHT
            )
            if maximum_rows < 1:
                page = add_page(False)
                cursor = float(page["top"])
                continue
            chunk = items[index : index + maximum_rows]
            page["sections"].append(
                {
                    "number": number,
                    "title": title,
                    "subtitle": subtitle,
                    "items": chunk,
                    "emptyLabel": empty_label,
                    "continued": continued,
                }
            )
            cursor -= item_block_height(len(chunk))
            index += len(chunk)
            if index < len(items):
                page = add_page(False)
                cursor = float(page["top"])
                continued = True

    totals_required = TITLE_TO_CONTENT + TOTALS_HEIGHT
    if cursor - totals_required < CONTENT_BOTTOM:
        page = add_page(False)
    page["totals"] = True
    return pages


def draw_first_page_intro(pdf: canvas.Canvas, data: dict[str, Any], show_company: bool) -> float:
    draw_background(pdf)
    draw_header(pdf, data)
    if show_company:
        draw_company(pdf, data)
    offset = 48 if not show_company else 0
    draw_reference_band(pdf, data, 674 + offset)
    section_title(pdf, 648 + offset, 1, "Defect declarat de client")
    draw_narrative_box(pdf, MARGIN, 594 + offset, CONTENT_W, 41, value(data, "sheet", "reportedIssue"), 3)
    section_title(pdf, 567 + offset, 2, "Diagnosticare")
    draw_narrative_box(pdf, MARGIN, 500 + offset, CONTENT_W, 54, value(data, "sheet", "technicalAssessment"), 4)
    return 474 + offset


def draw_item_page(
    pdf: canvas.Canvas,
    data: dict[str, Any],
    show_company: bool,
    plan: dict[str, Any],
    page_number: int,
    total_pages: int,
) -> None:
    if plan["first"]:
        cursor = draw_first_page_intro(pdf, data, show_company)
    else:
        draw_background(pdf)
        draw_header(pdf, data, continuation=True)
        draw_reference_band(pdf, data, 724)
        cursor = float(plan["top"])

    for section in plan["sections"]:
        title = section["title"]
        section_title(pdf, cursor, section["number"], title, section["subtitle"])
        content_top = cursor - TITLE_TO_CONTENT
        items = section["items"]
        if items:
            content_height = TABLE_HEADER_HEIGHT + len(items) * TABLE_ROW_HEIGHT
            content_y = content_top - content_height
            draw_items_table(pdf, MARGIN, content_y, CONTENT_W, items)
        else:
            content_y = content_top - EMPTY_TABLE_HEIGHT
            draw_empty_items(pdf, MARGIN, content_y, CONTENT_W, section["emptyLabel"])
        cursor = content_y - SECTION_SPACING

    if plan["totals"]:
        section_title(pdf, cursor, 5, "Cost total final", "total, achitat și rest de plată")
        draw_totals(pdf, data, cursor - TITLE_TO_CONTENT - TOTALS_HEIGHT)
    draw_footer(pdf, page_number, total_pages)


def draw_template_page_one(pdf: canvas.Canvas, data: dict[str, Any], show_company: bool) -> None:
    offset = draw_first_page_intro(pdf, data, show_company) - 474
    section_title(pdf, 474 + offset, 3, "Piese înlocuite", "denumire, cantitate și preț")
    section_title(pdf, 332 + offset, 4, "Manoperă", "operațiuni și costuri")
    section_title(pdf, 220 + offset, 5, "Cost total final", "total, achitat și rest de plată")
    draw_totals(pdf, data, 89 + offset, template_mode=True)
    draw_footer(pdf, 1, 2)


def draw_agreement_page(pdf: canvas.Canvas, data: dict[str, Any], page_number: int, total_pages: int) -> None:
    draw_background(pdf)
    draw_header(pdf, data, continuation=True)
    draw_reference_band(pdf, data, 724)
    draw_observations(pdf, data)
    draw_term(pdf, data)
    draw_final_agreement(pdf, data)
    draw_footer(pdf, page_number, total_pages)


def build_pdf(output: Path, data: dict[str, Any], show_company: bool) -> Path:
    register_fonts()
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    pdf.setTitle("Deviz final G-Shop")
    pdf.setAuthor("G-Shop")
    pdf.setSubject("Diagnosticare, piese, manoperă, cost final și acord client")
    pdf.setCreator("G-Shop final estimate generator")
    template_mode = data.get("templateMode") is True
    if template_mode:
        draw_template_page_one(pdf, data, show_company)
        pdf.showPage()
        draw_agreement_page(pdf, data, 2, 2)
        pdf.showPage()
        pdf.save()
        return output

    item_pages = plan_item_pages(data, show_company)
    total_pages = len(item_pages) + 1
    for page_number, plan in enumerate(item_pages, start=1):
        draw_item_page(pdf, data, show_company, plan, page_number, total_pages)
        pdf.showPage()
    draw_agreement_page(pdf, data, total_pages, total_pages)
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
        output = output_root / folder / "deviz-final.pdf"
        outputs.append(build_pdf(output, data, show_company))
    return outputs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generează devizul final G-Shop.")
    parser.add_argument(
        "--data",
        type=Path,
        help="JSON opțional cu company, client, sheet, intake, estimate, parts, labor, financials, summary și agreement.",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--company-mode", choices=("both", "with", "without"), default="both")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    for item in generate(args.output.resolve(), load_data(args.data), args.company_mode):
        print(item)
