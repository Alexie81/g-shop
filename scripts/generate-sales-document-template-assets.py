from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "api" / "assets" / "sales-document-templates"


def load_base() -> ModuleType:
    path = ROOT / "scripts" / "generate-final-estimate-pdfs.py"
    spec = importlib.util.spec_from_file_location("gshop_sales_template_base", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Generatorul de bază nu poate fi încărcat: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def blank_data() -> dict[str, object]:
    return {
        "templateMode": True,
        "documentProfile": "SALES",
        "company": {},
        "client": {},
        "sheet": {},
        "intake": {},
        "estimate": {},
        "parts": [],
        "labor": [],
        "financials": {},
        "summary": {},
        "agreement": {},
        "warranty": {},
    }


def header(
    pdf: canvas.Canvas,
    base: ModuleType,
    title: str,
    number_label: str,
    date_label: str,
) -> None:
    y = 758
    base.rounded_box(pdf, base.MARGIN, y, base.CONTENT_W, 62, radius=13)
    pdf.setFillColor(base.ELECTRIC)
    pdf.roundRect(base.MARGIN, y, 6, 62, 3, fill=1, stroke=0)
    base.draw_logo(pdf, base.MARGIN + 17, y + 8, 46)
    pdf.setFillColor(base.NAVY)
    pdf.setFont("GShop-Bold", 15.2 if title == "DEVIZ FINAL" else 13.2)
    pdf.drawString(base.MARGIN + 76, y + 38, title)
    pdf.setFillColor(base.ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 7.0)
    pdf.drawString(base.MARGIN + 76, y + 22, "CALCULATOARE PROFESIONALE | G-SHOP")

    info_x = base.PAGE_W - base.MARGIN - 230
    base.rounded_box(
        pdf,
        info_x,
        y + 10,
        218,
        42,
        radius=8,
        fill=base.ELECTRIC_LIGHT,
        stroke=HexColor("#B9D0FF"),
    )
    for label, offset, width in ((number_label, 12, 91), (date_label, 121, 87)):
        pdf.setFillColor(base.ELECTRIC_DARK)
        pdf.setFont("GShop-Bold", 5.4)
        pdf.drawString(info_x + offset, y + 37, label)
        pdf.setStrokeColor(HexColor("#9ABEFF"))
        pdf.setLineWidth(0.8)
        pdf.line(info_x + offset, y + 18, info_x + offset + width, y + 18)


def footer(pdf: canvas.Canvas, base: ModuleType, label: str) -> None:
    pdf.setStrokeColor(base.LINE)
    pdf.setLineWidth(0.6)
    pdf.line(base.MARGIN, 38, base.PAGE_W - base.MARGIN, 38)
    pdf.setFillColor(base.SLATE)
    pdf.setFont("GShop-Regular", 4.45)
    pdf.drawString(
        base.MARGIN,
        26,
        "În temeiul legii: OG 21/1992 | Legea 193/2000 | Codul civil | GDPR (UE) 2016/679 | Legea 190/2018.",
    )
    pdf.setFillColor(base.ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 5.3)
    pdf.drawRightString(base.PAGE_W - base.MARGIN, 18, label)


def sales_reference(pdf: canvas.Canvas, base: ModuleType, y: float) -> None:
    base.rounded_box(
        pdf,
        base.MARGIN,
        y,
        base.CONTENT_W,
        22,
        radius=7,
        fill=base.ELECTRIC_LIGHT,
        stroke=HexColor("#B9D0FF"),
    )
    base.draw_line_field(
        pdf,
        base.MARGIN + 11,
        y + 4,
        (base.CONTENT_W - 32) * 0.58,
        "Pentru fișa de vânzare nr.",
        label_size=5.5,
        label_width=107,
    )
    base.draw_line_field(
        pdf,
        base.MARGIN + 21 + (base.CONTENT_W - 32) * 0.58,
        y + 4,
        (base.CONTENT_W - 32) * 0.42,
        "Din data",
        label_size=5.5,
        label_width=38,
    )


def warranty_reference(pdf: canvas.Canvas, base: ModuleType) -> None:
    y = 658
    base.rounded_box(
        pdf,
        base.MARGIN,
        y,
        base.CONTENT_W,
        36,
        radius=7,
        fill=base.ELECTRIC_LIGHT,
        stroke=HexColor("#B9D0FF"),
    )
    fields = (
        (base.MARGIN + 11, y + 18, 310, "Pentru fișa de vânzare nr.", 107),
        (360, y + 18, 201, "Din data", 50),
        (base.MARGIN + 11, y + 3, 310, "Deviz final nr.", 107),
        (360, y + 3, 201, "Din data", 50),
    )
    for x, line_y, width, label, label_width in fields:
        base.draw_line_field(pdf, x, line_y, width, label, label_size=5.2, label_width=label_width)


def sales_narrative_box(
    pdf: canvas.Canvas,
    base: ModuleType,
    x: float,
    y: float,
    width: float,
    height: float,
    rows: int,
    line_gap: float,
) -> None:
    """Draw Shop writing guides directly below the runtime text baselines."""
    base.rounded_box(pdf, x, y, width, height)
    inner_x = x + 11
    inner_width = width - 22
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.75)
    first_line_y = y + height - 17
    for index in range(rows):
        line_y = first_line_y - index * line_gap
        pdf.line(inner_x, line_y, inner_x + inner_width, line_y)


def build_sales_sheet(base: ModuleType, data: dict[str, object]) -> Path:
    output = OUTPUT / "sales-sheet.pdf"
    pdf = canvas.Canvas(str(output), pagesize=base.A4, pageCompression=1)
    pdf.setTitle("Șablon fișă de vânzare | G-Shop")
    base.draw_background(pdf)
    header(pdf, base, "FIȘĂ DE VÂNZARE", "NR. FIȘĂ", "DATA ȘI ORA")
    base.draw_company(pdf, data)
    base.section_title(pdf, 675, 1, "Client", "date de facturare și contact")
    base.rounded_box(pdf, base.MARGIN, 590, base.CONTENT_W, 72)
    base.section_title(pdf, 560, 2, "Produs și livrare", "configurație, serie și predare")
    base.rounded_box(pdf, base.MARGIN, 410, base.CONTENT_W, 137)
    base.section_title(pdf, 380, 3, "Situație financiară", "total, încasat și rest de plată")
    base.rounded_box(pdf, base.MARGIN, 176, base.CONTENT_W, 191)
    base.section_title(pdf, 145, 4, "Confirmarea clientului", "semnătură și ștampilă")
    base.rounded_box(pdf, base.MARGIN, 53, base.CONTENT_W, 79)
    footer(pdf, base, "CALCULATOARE PROFESIONALE | G-SHOP")
    pdf.showPage()
    pdf.save()
    return output


def build_final_templates(base: ModuleType, data: dict[str, object]) -> list[Path]:
    outputs: list[Path] = []
    intro = OUTPUT / "final-estimate-intro.pdf"
    pdf = canvas.Canvas(str(intro), pagesize=base.A4, pageCompression=1)
    pdf.setTitle("Șablon deviz final fișă de vânzare | G-Shop")
    base.draw_background(pdf)
    header(pdf, base, "DEVIZ FINAL", "NR. DEVIZ", "DATA")
    base.draw_company(pdf, data)
    sales_reference(pdf, base, 674)
    base.section_title(pdf, 648, 1, "Solicitarea clientului")
    sales_narrative_box(pdf, base, base.MARGIN, 594, base.CONTENT_W, 41, 3, 10)
    base.section_title(pdf, 567, 2, "Configurație și verificare")
    sales_narrative_box(pdf, base, base.MARGIN, 500, base.CONTENT_W, 54, 4, 11)
    footer(pdf, base, "CALCULATOARE PROFESIONALE | G-SHOP")
    pdf.showPage()
    pdf.save()
    outputs.append(intro)

    continuation = OUTPUT / "final-estimate-continuation.pdf"
    pdf = canvas.Canvas(str(continuation), pagesize=base.A4, pageCompression=1)
    pdf.setTitle("Șablon continuare deviz fișă de vânzare | G-Shop")
    base.draw_background(pdf)
    header(pdf, base, "DEVIZ FINAL", "NR. DEVIZ", "DATA")
    sales_reference(pdf, base, 724)
    footer(pdf, base, "CALCULATOARE PROFESIONALE | G-SHOP")
    pdf.showPage()
    pdf.save()
    outputs.append(continuation)

    agreement = OUTPUT / "final-estimate-agreement.pdf"
    pdf = canvas.Canvas(str(agreement), pagesize=base.A4, pageCompression=1)
    pdf.setTitle("Șablon acord deviz fișă de vânzare | G-Shop")
    base.draw_background(pdf)
    header(pdf, base, "DEVIZ FINAL", "NR. DEVIZ", "DATA")
    sales_reference(pdf, base, 724)
    footer(pdf, base, "CALCULATOARE PROFESIONALE | G-SHOP")
    pdf.showPage()
    pdf.save()
    outputs.append(agreement)
    return outputs


def product_card(pdf: canvas.Canvas, base: ModuleType) -> None:
    base.rounded_box(pdf, base.MARGIN, 513, 271, 106, radius=9)
    labels = ("TIP ECHIPAMENT", "MARCĂ", "MODEL", "SERIE / IMEI", "ACOPERIRE")
    for index, label in enumerate(labels):
        line_y = 596 - index * 20
        base.draw_line_field(pdf, 33, line_y - 3.5, 248, label, label_size=4.8, label_width=84)


def warranty_card(pdf: canvas.Canvas, base: ModuleType) -> None:
    x = 303
    base.rounded_box(pdf, x, 513, 270, 106, radius=9)
    for index, label in enumerate(("PERIOADĂ GARANȚIE", "GARANȚIE DE LA", "GARANȚIE PÂNĂ LA")):
        line_y = 596 - index * 20
        base.draw_line_field(pdf, x + 11, line_y - 3.5, 248, label, label_size=4.8, label_width=91)
    base.rounded_box(
        pdf,
        x + 7,
        515.5,
        256,
        31,
        radius=6,
        fill=base.ELECTRIC_LIGHT,
        stroke=base.LINE,
        line_width=0.55,
    )
    pdf.setFillColor(base.ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 5.1)
    pdf.drawString(x + 15, 539, "CONTACT GARANȚIE")
    pdf.setFillColor(base.SLATE)
    pdf.setFont("GShop-Bold", 4.7)
    pdf.drawString(x + 15, 527, "TELEFON")
    pdf.drawString(x + 15, 517, "EMAIL")


def warranty_conditions(pdf: canvas.Canvas, base: ModuleType) -> None:
    base.rounded_box(
        pdf,
        base.MARGIN,
        340,
        base.CONTENT_W,
        132,
        radius=8,
        fill=base.ELECTRIC_LIGHT,
        stroke=HexColor("#B9D0FF"),
    )
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.6)
    pdf.line(base.PAGE_W / 2, 354, base.PAGE_W / 2, 458)


def confirmation_card(pdf: canvas.Canvas, base: ModuleType) -> None:
    base.rounded_box(pdf, base.MARGIN, 106, base.CONTENT_W, 178, radius=9)
    pdf.setFillColor(base.NAVY)
    pdf.setFont("GShop-Bold", 7.3)
    pdf.drawString(36, 255, "Clientul confirmă primirea certificatului și informarea privind condițiile garanției.")
    base.draw_line_field(pdf, 36, 233, 198, "Nume client", label_size=5.5, label_width=68)
    base.draw_line_field(pdf, 360, 233, 157, "Data și ora", label_size=5.5, label_width=57)
    pdf.setFillColor(base.SLATE)
    pdf.setFont("GShop-Bold", 5.8)
    pdf.drawString(36, 208, "ȘTAMPILĂ")
    pdf.drawString(360, 208, "SEMNĂTURĂ CLIENT")
    pdf.setStrokeColor(HexColor("#C8D3E3"))
    pdf.setLineWidth(0.85)
    pdf.line(360, 172, 462, 172)


def build_warranty(base: ModuleType, data: dict[str, object]) -> Path:
    output = OUTPUT / "warranty.pdf"
    pdf = canvas.Canvas(str(output), pagesize=base.A4, pageCompression=1)
    pdf.setTitle("Șablon certificat de garanție fișă de vânzare | G-Shop")
    base.draw_background(pdf)
    header(pdf, base, "CERTIFICAT DE GARANȚIE", "NR. CERTIFICAT", "DATA ȘI ORA")
    base.draw_company(pdf, data)
    warranty_reference(pdf, base)
    base.section_title(pdf, 632, 1, "Produs, vânzare și garanție", "identificarea obiectului garanției")
    product_card(pdf, base)
    warranty_card(pdf, base)
    base.section_title(pdf, 487, 2, "Condițiile garanției", "calitate, garanție și excluderi")
    warranty_conditions(pdf, base)
    base.section_title(pdf, 309, 3, "Confirmarea predării", "certificat remis clientului")
    confirmation_card(pdf, base)
    footer(pdf, base, "CALCULATOARE PROFESIONALE | G-SHOP")
    pdf.showPage()
    pdf.save()
    return output


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    base = load_base()
    base.register_fonts()
    data = blank_data()
    outputs = [build_sales_sheet(base, data), *build_final_templates(base, data), build_warranty(base, data)]
    for output in outputs:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
