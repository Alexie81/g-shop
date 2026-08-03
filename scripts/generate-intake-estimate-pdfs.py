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
DEFAULT_OUTPUT = ROOT / "output" / "pdf" / "fise-intrare-service-g-shop"
LOGO = ROOT / "api" / "assets" / "logo.png"

PAGE_W, PAGE_H = A4
MARGIN = 22
CONTENT_W = PAGE_W - 2 * MARGIN

# G-Shop tokens from theme/tokens.ts.
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
    regular_candidates = (
        Path(r"C:\Windows\Fonts\segoeui.ttf"),
        Path(r"C:\Windows\Fonts\arial.ttf"),
    )
    bold_candidates = (
        Path(r"C:\Windows\Fonts\segoeuib.ttf"),
        Path(r"C:\Windows\Fonts\arialbd.ttf"),
    )
    regular = next((path for path in regular_candidates if path.exists()), None)
    bold = next((path for path in bold_candidates if path.exists()), None)
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
    segments: list[tuple[str, bool, bool]],
    *,
    size: float = 6.55,
    line_height: float = 8.2,
    max_lines: int = 3,
) -> int:
    tokens: list[tuple[str, str, bool]] = []
    for segment_text, bold, underline in segments:
        font = "GShop-Bold" if bold else "GShop-Regular"
        tokens.extend((word, font, underline) for word in segment_text.split() if word)
    lines: list[list[tuple[str, str, bool, float, float]]] = [[]]
    line_widths = [0.0]
    for word, font, underline in tokens:
        word_width = pdfmetrics.stringWidth(word, font, size)
        space_width = pdfmetrics.stringWidth(" ", "GShop-Regular", size) if lines[-1] else 0.0
        if lines[-1] and line_widths[-1] + space_width + word_width > width:
            if len(lines) >= max_lines:
                break
            lines.append([])
            line_widths.append(0.0)
            space_width = 0.0
        lines[-1].append((word, font, underline, space_width, word_width))
        line_widths[-1] += space_width + word_width
    pdf.setFillColor(NAVY)
    for line_index, line in enumerate(lines):
        cursor_x = x
        baseline = y - line_index * line_height
        for word, font, underline, space_width, word_width in line:
            cursor_x += space_width
            pdf.setFont(font, size)
            pdf.drawString(cursor_x, baseline, word)
            if underline:
                pdf.setStrokeColor(NAVY)
                pdf.setLineWidth(0.55)
                pdf.line(cursor_x, baseline - 1.5, cursor_x + word_width, baseline - 1.5)
            cursor_x += word_width
    return len(lines)


def draw_header(pdf: canvas.Canvas, data: dict[str, Any], continuation: bool = False) -> None:
    # Keep the complete header safely inside the A4 media box on every page.
    y = 754
    rounded_box(pdf, MARGIN, y, CONTENT_W, 62, radius=13)
    pdf.setFillColor(ELECTRIC)
    pdf.roundRect(MARGIN, y, 6, 62, 3, fill=1, stroke=0)
    draw_logo(pdf, MARGIN + 17, y + 8, 46)

    pdf.setFillColor(NAVY)
    pdf.setFont("GShop-Bold", 14.4)
    pdf.drawString(MARGIN + 76, y + 38, "FIȘĂ DE INTRARE ÎN SERVICE")
    pdf.setFillColor(ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 7.4)
    pdf.drawString(MARGIN + 76, y + 22, "COST ESTIMATIV | G-SHOP")

    info_x = PAGE_W - MARGIN - 230
    rounded_box(
        pdf,
        info_x,
        y + 10,
        218,
        42,
        radius=8,
        fill=ELECTRIC_LIGHT,
        stroke=HexColor("#B9D0FF"),
    )
    fields = (
        ("NR. FIȘĂ", value(data, "sheet", "number"), 10, 91),
        (
            "DATA ȘI ORA",
            first_value(data, (("sheet", "receivedAt"), ("sheet", "createdAt"))),
            116,
            91,
        ),
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
            pdf.drawString(
                info_x + offset + 3,
                y + 21,
                fit_text(field_value, "GShop-Bold", 6.3, width - 6),
            )


def draw_footer(pdf: canvas.Canvas, page: int, total: int = 2) -> None:
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
    pdf.setFillColor(ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 5.5)
    pdf.setFillColor(SLATE)
    pdf.drawCentredString(PAGE_W / 2, 18, f"Pagina {page}/{total}")
    pdf.setFillColor(ELECTRIC_DARK)
    pdf.drawRightString(PAGE_W - MARGIN, 18, "G-SHOP | INTRARE SERVICE")


def section_title(pdf: canvas.Canvas, y: float, number: int, title: str, subtitle: str = "") -> None:
    x = MARGIN + 3
    pdf.setFillColor(ELECTRIC)
    pdf.circle(x + 8, y + 8, 8, fill=1, stroke=0)
    pdf.setFillColor(white)
    pdf.setFont("GShop-Bold", 7.3)
    pdf.drawCentredString(x + 8, y + 5.3, str(number))
    pdf.setFillColor(NAVY)
    pdf.setFont("GShop-Bold", 9.7)
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
    label_size: float = 5.8,
    label_width: float | None = None,
) -> None:
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", label_size)
    pdf.drawString(x, y + 3, label.upper())
    computed_label_width = label_width or (
        pdfmetrics.stringWidth(label.upper(), "GShop-Bold", label_size) + 7
    )
    line_x = min(x + computed_label_width, x + width - 14)
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.8)
    pdf.line(line_x, y, x + width, y)
    if field_value:
        pdf.setFillColor(NAVY)
        pdf.setFont("GShop-Regular", 6.8)
        pdf.drawString(
            line_x + 4,
            y + 2,
            fit_text(field_value, "GShop-Regular", 6.8, x + width - line_x - 7),
        )


def draw_company(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    y = 704
    rounded_box(pdf, MARGIN, y, CONTENT_W, 44, radius=8)
    draw_line_field(pdf, 32, 730, 190, "Denumire juridică", value(data, "company", "legalName"), label_width=64)
    draw_line_field(pdf, 230, 730, 105, "CUI / CIF", value(data, "company", "taxId"), label_size=5.1, label_width=34)
    draw_line_field(pdf, 343, 730, 220, "Registrul Comerțului", value(data, "company", "tradeRegisterNumber"), label_size=5.1, label_width=103)
    draw_line_field(pdf, 32, 716, 531, "Sediu", full_address(data, "company"), label_width=32)
    draw_line_field(pdf, 32, 705, 210, "Telefon", value(data, "company", "phone"), label_width=36)
    draw_line_field(pdf, 250, 705, 313, "Email", value(data, "company", "email"), label_width=34)


def draw_client_and_equipment(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(pdf, 679, 1, "Client și echipament", "date de identificare și recepție")
    y, height = 565, 101
    gap = 10
    card_width = (CONTENT_W - gap) / 2
    rounded_box(pdf, MARGIN, y, card_width, height)
    rounded_box(pdf, MARGIN + card_width + gap, y, card_width, height)

    left_x = MARGIN + 11
    right_x = MARGIN + card_width + gap + 11
    inner_width = card_width - 22
    line_positions = (78, 60, 42, 24, 6)
    label_width = 84
    left_fields = (
        ("Nume client", client_name(data), 5.8),
        ("Telefon", value(data, "client", "phone"), 5.8),
        ("Telefon secundar", value(data, "client", "secondaryPhone"), 5.3),
        ("Email", value(data, "client", "email"), 5.8),
        ("Adresă", full_address(data, "client"), 5.8),
    )
    right_fields = (
        ("Tip echipament", value(data, "sheet", "equipment"), 5.6),
        ("Marcă", value(data, "sheet", "brand"), 5.8),
        ("Model", value(data, "sheet", "model"), 5.8),
        ("Serie / IMEI (dacă există)", value(data, "sheet", "serialNumber"), 4.5),
        ("Accesorii predate", value(data, "sheet", "accessories"), 5.2),
    )
    for (label, field_value, size), offset in zip(left_fields, line_positions):
        draw_line_field(
            pdf,
            left_x,
            y + offset,
            inner_width,
            label,
            field_value,
            label_size=size,
            label_width=label_width,
        )
    for (label, field_value, size), offset in zip(right_fields, line_positions):
        draw_line_field(
            pdf,
            right_x,
            y + offset,
            inner_width,
            label,
            field_value,
            label_size=size,
            label_width=label_width,
        )


def draw_problem(pdf: canvas.Canvas, data: dict[str, Any]) -> None:
    section_title(pdf, 539, 2, "Problema declarată", "simptomele comunicate de client")
    y, height = 396, 130
    rounded_box(pdf, MARGIN, y, CONTENT_W, height)
    x = MARGIN + 12
    width = CONTENT_W - 24
    problem = value(data, "sheet", "reportedIssue")
    if problem:
        lines = wrap_text(problem, "GShop-Regular", 7.0, width)
        pdf.setFillColor(NAVY)
        pdf.setFont("GShop-Regular", 7.0)
        for index, line in enumerate(lines[:7]):
            pdf.drawString(x, y + height - 18 - index * 14, line)
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.75)
    for index in range(7):
        line_y = y + height - 20 - index * 14
        pdf.line(x, line_y, x + width, line_y)


def placeholder(field_value: str, dots: str = "................") -> str:
    return field_value if field_value else dots


def draw_conditions(
    pdf: canvas.Canvas,
    data: dict[str, Any],
    *,
    section_y: float = 435,
    box_y: float = 278,
    height: float = 144,
    number: int = 3,
) -> None:
    section_title(pdf, section_y, number, "Condiții de reparație și cost estimativ", "informare și acord inițial")
    y = box_y
    rounded_box(
        pdf,
        MARGIN,
        y,
        CONTENT_W,
        height,
        fill=ELECTRIC_LIGHT,
        stroke=HexColor("#B9D0FF"),
    )
    pdf.setFillColor(ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 7.2)
    pdf.drawString(MARGIN + 12, y + height - 17, "CONDIȚII ȘI COST ESTIMATIV")

    diagnostic = value(data, "financials", "diagnosticFee")
    estimated_total = first_value(
        data,
        (("summary", "totalDue"), ("sheet", "estimatedTotal"), ("sheet", "totalCost")),
    )
    currency = first_value(data, (("financials", "currencyCode"), ("sheet", "currencyCode")))
    repair_days = value(data, "sheet", "estimatedRepairDays")
    diagnostic_display = money_display(diagnostic, currency)
    estimated_total_display = money_display(estimated_total, currency)
    agreement_status = value(data, "agreement", "status").upper()
    if agreement_status in ("AGREE", "ACCEPTED"):
        decision_prefix = "Clientul declară că a fost informat și acceptă suma estimată de"
        decision_suffix = "pentru reparație."
    elif agreement_status in ("DISAGREE", "REJECTED", "REFUSED"):
        decision_prefix = "Clientul declară că a fost informat și nu acceptă suma estimată de"
        decision_suffix = "pentru reparație."
    else:
        decision_prefix = "Clientul declară că a fost informat despre suma estimată de"
        decision_suffix = "pentru reparație; acordul nu a fost încă exprimat."
    items = (
        [("La predare, produsul intră în constatare.", False, False)],
        [
            ("Costul", False, False),
            ("constatării/diagnosticării", True, False),
            ("este", False, False),
            (money_display(0, currency), True, True),
            ("(inclus în reparație) / sau", False, False),
            (placeholder(diagnostic_display), True, True),
            ("dacă nu se efectuează reparația.", False, False),
        ],
        [("După constatare, se comunică clientului devizul estimativ.", False, False)],
        [
            (decision_prefix, False, False),
            (placeholder(estimated_total_display), True, True),
            (decision_suffix, False, False),
        ],
        [("Dacă pe parcurs apar defecțiuni suplimentare sau piese adiționale necesare, clientul va fi informat și va transmite un nou acord (prin semnătură, e-mail sau WhatsApp).", False, False)],
        [
            ("Termen estimat reparație:", False, False),
            (f"{placeholder(repair_days, '........')} zile lucrătoare.", True, True),
        ],
    )
    x = MARGIN + 12
    text_width = CONTENT_W - 32
    cursor_y = y + height - 33
    for index, segments in enumerate(items, start=1):
        pdf.setFillColor(ELECTRIC_DARK)
        pdf.setFont("GShop-Bold", 6.4)
        pdf.drawString(x, cursor_y, f"{index}.")
        line_count = draw_rich_paragraph(pdf, x + 18, cursor_y, text_width - 18, segments, size=6.55, line_height=8.2, max_lines=3)
        cursor_y -= max(1, line_count) * 8.2 + 3.2


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
        pdf.roundRect(x, y + 8, 3.5, height - 16, 1.75, fill=1, stroke=0)
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
        value_size = (13.8 if width >= 180 else 12.1) if height >= 75 else (12.2 if width >= 180 else 10.6)
        pdf.setFillColor(value_color)
        pdf.setFont("GShop-Bold", value_size)
        pdf.drawString(
            x + 11,
            y + max(13, height * 0.24),
            fit_text(field_value, "GShop-Bold", value_size, width - 22),
        )


def financial_detail(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    label: str,
    field_value: str = "",
    *,
    height: float = 30,
) -> None:
    rounded_box(pdf, x, y, width, height, radius=7, fill=SURFACE_MUTED, stroke=LINE, line_width=0.55)
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", 4.7)
    pdf.drawString(x + 8, y + height - 16, label.upper())
    if field_value:
        pdf.setFillColor(NAVY)
        value_size = 8.2 if height >= 45 else 7.0
        pdf.setFont("GShop-Bold", value_size)
        pdf.drawString(x + 8, y + max(5, height * 0.25), fit_text(field_value, "GShop-Bold", value_size, width - 16))


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


def payment_total_cards(
    pdf: canvas.Canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    before_discount: float,
    total: float,
    has_discount: bool,
    currency: str,
    total_status: str,
) -> None:
    if not has_discount:
        financial_summary_card(pdf, x, y, width, "Total de plată", money_display(total, currency), fill=ELECTRIC, value_color=white, dark=True, height=height, status=total_status)
        return
    gap = 7.0
    card_height = (height - gap) / 2
    for index, (label, amount) in enumerate((
        ("Total estimativ fără reducere", before_discount),
        ("Total de plată cu reducere", total),
    )):
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


def draw_estimated_costs(
    pdf: canvas.Canvas,
    data: dict[str, Any],
    *,
    section_y: float = 324,
    box_y: float = 72,
    height: float = 234,
    number: int = 4,
) -> None:
    section_title(pdf, section_y, number, "Cost estimativ și plată", "completat înainte de începerea reparației")
    y = box_y
    rounded_box(pdf, MARGIN, y, CONTENT_W, height)
    inner_x = MARGIN + 11
    inner_width = CONTENT_W - 22

    total = first_value(
        data,
        (("summary", "totalDue"), ("sheet", "estimatedTotal"), ("sheet", "totalCost")),
    )
    paid = first_value(data, (("summary", "receivedAmount"), ("financials", "advancePaid")))
    remaining = first_value(
        data,
        (("summary", "remainingDue"), ("sheet", "estimatedRemaining")),
    )
    diagnostic = value(data, "financials", "diagnosticFee")
    parts = first_value(data, (("financials", "displayedPartsCost"), ("sheet", "partsCost")))
    labor = first_value(data, (("financials", "displayedLaborCost"), ("sheet", "laborCost")))
    discount = value(data, "financials", "discountPercent")
    currency = first_value(data, (("financials", "currencyCode"), ("sheet", "currencyCode")))

    total_display = money_display(total, currency)
    paid_display = money_display(paid, currency)
    remaining_display = money_display(remaining, currency)

    gap = 8
    summary_widths = (207.0, 143.0, inner_width - 207.0 - 143.0 - gap * 2)
    before_discount, total_value, has_discount, total_status, rest_status = payment_total_values(data, total, paid, remaining, diagnostic, parts, labor)
    payment_total_cards(pdf, inner_x, y + 128, summary_widths[0], 82, before_discount, total_value, has_discount, currency, total_status)
    x = inner_x + summary_widths[0] + gap
    for label, field_value, width, fill, value_color, dark, accent in (
        ("Achitat", paid_display, summary_widths[1], white, SUCCESS, False, SUCCESS),
        ("Rest de plată", remaining_display, summary_widths[2], white, SUCCESS if numeric_amount(remaining) <= 0.009 else WARNING, False, SUCCESS if numeric_amount(remaining) <= 0.009 else WARNING),
    ):
        financial_summary_card(
            pdf,
            x,
            y + 128,
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
    breakdown = (
        ("Diagnostic", money_display(diagnostic, currency), regular_width),
        ("Piese", money_display(parts, currency), regular_width),
        ("Manoperă", money_display(labor, currency), regular_width),
        ("Reducere", f"{discount}%" if discount and not discount.endswith("%") else discount, regular_width),
        ("Monedă", currency, currency_width),
    )
    for label, field_value, width in breakdown:
        financial_detail(pdf, x, y + 37, width, label, field_value, height=54)
        x += width + small_gap


def draw_stamp_placeholder(pdf: canvas.Canvas, x: float, y: float, width: float, height: float) -> None:
    pdf.setStrokeColor(HexColor("#A9B8CC"))
    pdf.setLineWidth(0.8)
    pdf.setDash(3, 2)
    pdf.roundRect(x, y, width, height, 6, fill=0, stroke=1)
    pdf.setDash()


def draw_acceptance(pdf: canvas.Canvas, data: dict[str, Any], y: float = 205, height: float = 145) -> None:
    rounded_box(pdf, MARGIN, y, CONTENT_W, height)
    if not data.get("templateMode"):
        agreement_status = value(data, "agreement", "status").upper()
        if agreement_status in ("AGREE", "ACCEPTED"):
            confirmation = "Clientul confirmă că a citit și acceptă condițiile generale de service și costul estimativ."
        elif agreement_status in ("DISAGREE", "REJECTED", "REFUSED"):
            confirmation = "Clientul confirmă că a citit și nu acceptă condițiile generale de service și costul estimativ."
        else:
            confirmation = "Clientul confirmă că a citit documentul; acordul privind condițiile generale de service și costul estimativ nu a fost încă exprimat."
        pdf.setFillColor(NAVY)
        pdf.setFont("GShop-Bold", 7.1)
        for line_index, line in enumerate(wrap_text(confirmation, "GShop-Bold", 7.1, CONTENT_W - 22)):
            pdf.drawString(MARGIN + 11, y + height - 25 - line_index * 9.5, line)
    inner_x = MARGIN + 11
    draw_line_field(pdf, inner_x, y + height - 60, 207, "Nume client", client_name(data), label_width=68)
    draw_line_field(
        pdf,
        365,
        y + height - 60,
        162,
        "Data și ora",
        value(data, "sheet", "signedAt"),
        label_width=62,
    )
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Bold", 6.1)
    pdf.drawString(inner_x, y + height - 91, "SEMNĂTURĂ CLIENT")
    stamp_x = 403
    pdf.drawString(stamp_x, y + height - 91, "ȘTAMPILĂ")
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.85)
    pdf.line(inner_x, 220, inner_x + 102, 220)
    # Ștampila se aplică direct pe fundal, fără chenar ajutător.


GENERAL_TERMS_LEFT = (
    ("1", "Clientul declară că deține echipamentul sau este autorizat să îl predea și că datele comunicate sunt corecte."),
    ("2", "Predarea autorizează recepția, fotografierea stării, diagnosticul, demontarea necesară și testele tehnice."),
    ("3", "Devizul inițial este informativ. Lucrările ori piesele suplimentare se execută după acordul clientului."),
    ("4", "Termenul estimat se poate modifica din cauza pieselor indisponibile, defectelor ascunse sau incompatibilităților."),
)

GENERAL_TERMS_RIGHT = (
    ("5", "Pentru baterii lovite, umflate, inundate ori cu risc termic, service-ul poate opri testarea și recomanda reciclarea."),
    ("6", "Garanția lucrării și a pieselor este cea înscrisă în fișă, factură sau certificat și curge de la predare."),
    ("7", "Datele personale sunt folosite pentru service, comunicare, facturare, garanție și îndeplinirea obligațiilor legale."),
    ("8", "Aceste condiții nu limitează drepturile consumatorului. Litigiile pot fi soluționate amiabil ori prin căile legale."),
)


def draw_terms_column(
    pdf: canvas.Canvas,
    x: float,
    y_top: float,
    width: float,
    items: tuple[tuple[str, str], ...],
) -> None:
    cursor_y = y_top
    for number, term in items:
        pdf.setFillColor(ELECTRIC_DARK)
        pdf.setFont("GShop-Bold", 6.6)
        pdf.drawString(x, cursor_y, f"{number}.")
        lines = wrap_text(term, "GShop-Regular", 6.6, width - 18)
        pdf.setFillColor(NAVY)
        pdf.setFont("GShop-Regular", 6.6)
        for index, line in enumerate(lines):
            pdf.drawString(x + 18, cursor_y - index * 8.2, line)
        cursor_y -= len(lines) * 8.2 + 5.5


def draw_general_terms(pdf: canvas.Canvas) -> None:
    section_title(pdf, 718, 4, "Condiții generale de service", "reguli aplicabile reparației")
    y, height = 570, 130
    rounded_box(
        pdf,
        MARGIN,
        y,
        CONTENT_W,
        height,
        fill=ELECTRIC_LIGHT,
        stroke=HexColor("#B9D0FF"),
    )
    split = MARGIN + CONTENT_W / 2
    pdf.setStrokeColor(HexColor("#B9D0FF"))
    pdf.setLineWidth(0.8)
    pdf.line(split, y + 16, split, y + height - 16)
    draw_terms_column(pdf, MARGIN + 12, y + height - 22, CONTENT_W / 2 - 24, GENERAL_TERMS_LEFT)
    draw_terms_column(pdf, split + 12, y + height - 22, CONTENT_W / 2 - 24, GENERAL_TERMS_RIGHT)
    pdf.setFillColor(SLATE)
    pdf.setFont("GShop-Regular", 5.6)
    pdf.drawString(
        MARGIN + 12,
        y + 9,
        "Repere: OG 21/1992, Legea 193/2000, Regulamentul (UE) 2016/679 și Legea 190/2018.",
    )


def build_pdf(output: Path, data: dict[str, Any], show_company: bool) -> Path:
    register_fonts()
    output.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    pdf.setTitle("Fișă de intrare în service / cost estimativ G-Shop")
    pdf.setAuthor("G-Shop")
    pdf.setSubject("Predare produs, condiții de reparație și cost estimativ")
    pdf.setCreator("G-Shop intake estimate generator")

    draw_background(pdf)
    draw_header(pdf, data)
    if show_company:
        draw_company(pdf, data)
    pdf.saveState()
    if not show_company:
        pdf.translate(0, 48)
    draw_client_and_equipment(pdf, data)
    draw_problem(pdf, data)
    draw_estimated_costs(pdf, data, section_y=366, box_y=114, height=234, number=3)
    pdf.restoreState()
    draw_footer(pdf, 1)
    pdf.showPage()
    draw_background(pdf)
    draw_header(pdf, data)
    draw_general_terms(pdf)
    draw_conditions(pdf, data, section_y=543, box_y=389, height=141, number=5)
    section_title(pdf, 362, 6, "Confirmarea clientului", "decizie pentru întregul document")
    draw_acceptance(pdf, data, y=90, height=258)
    draw_footer(pdf, 2)
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
        output = output_root / folder / "fisa-intrare-service-cost-estimativ.pdf"
        outputs.append(build_pdf(output, data, show_company))
    return outputs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generează fișa de intrare în service și cost estimativ G-Shop.")
    parser.add_argument(
        "--data",
        type=Path,
        help="JSON opțional cu obiectele company, client, sheet, financials și summary.",
    )
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--company-mode", choices=("both", "with", "without"), default="both")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    for item in generate(args.output.resolve(), load_data(args.data), args.company_mode):
        print(item)
