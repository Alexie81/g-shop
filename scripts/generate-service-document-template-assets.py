from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "api" / "assets" / "service-document-templates"
READABLE_FONT_SCALE = 1.12


class ReadableCanvas(canvas.Canvas):
    """Render template labels slightly larger without changing A4 geometry."""

    def setFont(self, psfontname: str, size: float, leading: float | None = None) -> None:  # noqa: N802
        scaled_leading = leading * READABLE_FONT_SCALE if leading is not None else None
        super().setFont(psfontname, size * READABLE_FONT_SCALE, scaled_leading)


class ReadablePdfMetrics:
    """Make template wrapping calculations match the enlarged font size."""

    def __init__(self, delegate: object) -> None:
        self.delegate = delegate

    def __getattr__(self, name: str) -> object:
        return getattr(self.delegate, name)

    def stringWidth(self, text: str, font_name: str, size: float, encoding: str = "utf8") -> float:  # noqa: N802
        return self.delegate.stringWidth(text, font_name, size * READABLE_FONT_SCALE, encoding)


def load_generator(name: str, filename: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Generatorul {filename} nu poate fi încărcat.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def blank_data() -> dict[str, object]:
    return {
        "templateMode": True,
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
        "exit": {},
    }


def draw_footer_base(pdf: canvas.Canvas, module: ModuleType, label: str) -> None:
    pdf.setStrokeColor(module.LINE)
    pdf.setLineWidth(0.6)
    pdf.line(module.MARGIN, 38, module.PAGE_W - module.MARGIN, 38)
    pdf.setFillColor(module.SLATE)
    pdf.setFont("GShop-Regular", 4.45)
    pdf.drawString(
        module.MARGIN,
        26,
        "În temeiul legii: OG 21/1992 | Legea 193/2000 | Codul civil | GDPR (UE) 2016/679 | Legea 190/2018.",
    )
    pdf.setFillColor(module.ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 5.3)
    pdf.drawRightString(module.PAGE_W - module.MARGIN, 18, label)


def build_intake(module: ModuleType, data: dict[str, object]) -> Path:
    output = OUTPUT / "intake.pdf"
    module.register_fonts()
    pdf = ReadableCanvas(str(output), pagesize=module.A4, pageCompression=1)
    pdf.setTitle("Șablon fișă de intrare G-Shop")

    module.draw_background(pdf)
    module.draw_header(pdf, data)
    module.draw_company(pdf, data)
    module.draw_client_and_equipment(pdf, data)
    module.draw_problem(pdf, data)
    module.draw_estimated_costs(pdf, data, section_y=366, box_y=114, height=234, number=3)
    draw_footer_base(pdf, module, "G-SHOP | INTRARE SERVICE")
    pdf.showPage()

    module.draw_background(pdf)
    module.draw_header(pdf, data)
    module.draw_general_terms(pdf)
    module.section_title(pdf, 543, 5, "Condiții de reparație și cost estimativ", "informare și acord inițial")
    module.rounded_box(
        pdf,
        module.MARGIN,
        389,
        module.CONTENT_W,
        141,
        fill=module.ELECTRIC_LIGHT,
        stroke=module.HexColor("#B9D0FF"),
    )
    pdf.setFillColor(module.ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 7.2)
    pdf.drawString(module.MARGIN + 12, 513, "CONDIȚII ȘI COST ESTIMATIV")
    module.section_title(pdf, 362, 6, "Confirmarea clientului", "decizie pentru întregul document")
    module.draw_acceptance(pdf, data, y=90, height=258)
    draw_footer_base(pdf, module, "G-SHOP | INTRARE SERVICE")
    pdf.showPage()
    pdf.save()
    return output


def build_final_templates(module: ModuleType, data: dict[str, object]) -> list[Path]:
    module.register_fonts()
    outputs: list[Path] = []

    intro = OUTPUT / "final-estimate-intro.pdf"
    pdf = ReadableCanvas(str(intro), pagesize=module.A4, pageCompression=1)
    pdf.setTitle("Șablon deviz final - introducere G-Shop")
    module.draw_background(pdf)
    module.draw_header(pdf, data)
    module.draw_company(pdf, data)
    module.draw_reference_band(pdf, data, 674)
    module.section_title(pdf, 648, 1, "Defect declarat de client")
    module.draw_narrative_box(pdf, module.MARGIN, 594, module.CONTENT_W, 41, "", 3)
    module.section_title(pdf, 567, 2, "Diagnosticare")
    module.draw_narrative_box(pdf, module.MARGIN, 500, module.CONTENT_W, 54, "", 4)
    draw_footer_base(pdf, module, "G-SHOP | DEVIZ FINAL")
    pdf.showPage()
    pdf.save()
    outputs.append(intro)

    continuation = OUTPUT / "final-estimate-continuation.pdf"
    pdf = ReadableCanvas(str(continuation), pagesize=module.A4, pageCompression=1)
    pdf.setTitle("Șablon deviz final - pagină articole G-Shop")
    module.draw_background(pdf)
    module.draw_header(pdf, data, continuation=True)
    module.draw_reference_band(pdf, data, 724)
    draw_footer_base(pdf, module, "G-SHOP | DEVIZ FINAL")
    pdf.showPage()
    pdf.save()
    outputs.append(continuation)

    agreement = OUTPUT / "final-estimate-agreement.pdf"
    pdf = ReadableCanvas(str(agreement), pagesize=module.A4, pageCompression=1)
    pdf.setTitle("Șablon deviz final - acord G-Shop")
    module.draw_background(pdf)
    module.draw_header(pdf, data, continuation=True)
    module.draw_reference_band(pdf, data, 724)
    module.draw_observations(pdf, data)
    module.draw_term(pdf, data)
    module.draw_final_agreement(pdf, data)
    draw_footer_base(pdf, module, "G-SHOP | DEVIZ FINAL")
    pdf.showPage()
    pdf.save()
    outputs.append(agreement)
    return outputs


def build_exit(module: ModuleType, data: dict[str, object]) -> Path:
    output = OUTPUT / "exit.pdf"
    module.register_fonts()
    pdf = ReadableCanvas(str(output), pagesize=module.A4, pageCompression=1)
    pdf.setTitle("Șablon fișă de ieșire G-Shop")
    module.draw_background(pdf)
    module.draw_header(pdf, data)
    module.draw_company(pdf, data)
    module.draw_reference_band(pdf, data)
    module.draw_client_equipment(pdf, data)
    module.draw_defect(pdf, data)
    module.draw_product_state(pdf, data)
    module.draw_pickup(pdf, data)
    draw_footer_base(pdf, module, "G-SHOP | IEȘIRE SERVICE")
    pdf.showPage()
    pdf.save()
    return output


def build_warranty(module: ModuleType, data: dict[str, object]) -> Path:
    output = OUTPUT / "warranty.pdf"
    module.register_fonts()
    pdf = ReadableCanvas(str(output), pagesize=module.A4, pageCompression=1)
    pdf.setTitle("Șablon certificat de calitate și garanție G-Shop")

    module.draw_background(pdf)
    y = 758
    module.rounded_box(pdf, module.MARGIN, y, module.CONTENT_W, 62, radius=13)
    pdf.setFillColor(module.ELECTRIC)
    pdf.roundRect(module.MARGIN, y, 6, 62, 3, fill=1, stroke=0)
    module.draw_logo(pdf, module.MARGIN + 17, y + 8, 46)
    pdf.setFillColor(module.NAVY)
    pdf.setFont("GShop-Bold", 11.4)
    pdf.drawString(module.MARGIN + 76, y + 40, "CERTIFICAT DE CALITATE")
    pdf.drawString(module.MARGIN + 76, y + 27, "ȘI GARANȚIE")
    pdf.setFillColor(module.ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 6.2)
    pdf.drawString(module.MARGIN + 76, y + 13, "SERVICE ȘI PIESE ÎNLOCUITE | G-SHOP")
    info_x = module.PAGE_W - module.MARGIN - 230
    module.rounded_box(
        pdf,
        info_x,
        y + 10,
        218,
        42,
        radius=8,
        fill=module.ELECTRIC_LIGHT,
        stroke=module.HexColor("#B9D0FF"),
    )
    for label, offset, width in (("NR. CERTIFICAT", 10, 94), ("DATA ȘI ORA", 119, 89)):
        pdf.setFillColor(module.ELECTRIC_DARK)
        pdf.setFont("GShop-Bold", 4.7)
        pdf.drawString(info_x + offset, y + 37, label)
        pdf.setStrokeColor(module.HexColor("#9ABEFF"))
        pdf.setLineWidth(0.8)
        pdf.line(info_x + offset, y + 18, info_x + offset + width, y + 18)

    module.draw_company(pdf, data)
    module.rounded_box(
        pdf,
        module.MARGIN,
        658,
        module.CONTENT_W,
        36,
        radius=7,
        fill=module.ELECTRIC_LIGHT,
        stroke=module.HexColor("#B9D0FF"),
    )
    fields = (
        (module.MARGIN + 11, 676, 310, "Fișă de intrare nr.", 100),
        (360, 676, 201, "Din data", 50),
        (module.MARGIN + 11, 661, 310, "Deviz final nr.", 100),
        (360, 661, 201, "Din data", 50),
    )
    for x, line_y, width, label, label_width in fields:
        module.draw_line_field(pdf, x, line_y, width, label, label_size=5.2, label_width=label_width)

    module.section_title(pdf, 632, 1, "Produs, reparație și garanție", "identificarea obiectului garanției")
    module.rounded_box(pdf, module.MARGIN, 513, 271, 106, radius=9)
    for index, label in enumerate(("TIP ECHIPAMENT", "MARCĂ", "MODEL", "SERIE / IMEI (DACĂ EXISTĂ)", "PRODUS / REPARAȚIE")):
        module.draw_line_field(pdf, 33, 592 - index * 20, 248, label, label_size=4.8, label_width=84)
    module.rounded_box(pdf, 303, 513, 270, 106, radius=9)
    for index, label in enumerate(("PERIOADĂ GARANȚIE", "GARANȚIE DE LA", "GARANȚIE PÂNĂ LA", "REMEDIERE ESTIMATĂ", "CONTACT SERVICE")):
        module.draw_line_field(pdf, 314, 592 - index * 20, 248, label, label_size=4.8, label_width=91)

    module.section_title(pdf, 487, 2, "Condițiile garanției", "calitate, service și excluderi")
    module.rounded_box(
        pdf,
        module.MARGIN,
        340,
        module.CONTENT_W,
        132,
        radius=8,
        fill=module.ELECTRIC_LIGHT,
        stroke=module.HexColor("#B9D0FF"),
    )
    pdf.setStrokeColor(module.HexColor("#C8D3E3"))
    pdf.setLineWidth(0.6)
    pdf.line(module.PAGE_W / 2, 354, module.PAGE_W / 2, 458)
    conditions = (
        "Prezentul certificat atestă calitatea reparației și conformitatea pieselor înlocuite, menționate în documentele de service.",
        "Produsul sau reparația beneficiază de garanție, suport tehnic și service pentru perioada înscrisă în certificat.",
        "Defecțiunile imputabile lucrării ori pieselor acoperite se remediază fără costuri pentru client, după verificarea tehnică.",
        "Garanția nu acoperă șocuri, lichide, utilizare necorespunzătoare, intervenții neautorizate, supratensiuni sau uzură normală.",
        "Produsul se prezintă împreună cu certificatul și documentul de plată. Termenul de remediere se comunică la recepție.",
        "Prezentele condiții nu limitează drepturile consumatorului prevăzute de legislația aplicabilă.",
    )
    for index, condition in enumerate(conditions):
        column = 0 if index < 3 else 1
        row = index % 3
        number_x = 34 + column * 275
        text_x = 52 + column * 275
        baseline = 449 - row * 35
        pdf.setFillColor(module.ELECTRIC_DARK)
        pdf.setFont("GShop-Bold", 5.8)
        pdf.drawString(number_x, baseline, f"{index + 1}.")
        pdf.setFillColor(module.NAVY)
        pdf.setFont("GShop-Regular", 5.4)
        for line_index, line in enumerate(module.wrap_text(condition, "GShop-Regular", 5.4, 220)[:3]):
            pdf.drawString(text_x, baseline - line_index * 7.4, line)

    module.section_title(pdf, 309, 3, "Confirmarea predării", "certificat remis clientului")
    module.rounded_box(pdf, module.MARGIN, 106, module.CONTENT_W, 178, radius=9)
    pdf.setFillColor(module.NAVY)
    pdf.setFont("GShop-Bold", 7.0)
    pdf.drawString(36, 255, "Clientul confirmă primirea certificatului și informarea privind condițiile garanției.")
    module.draw_line_field(pdf, 36, 233, 198, "Nume client", label_size=5.5, label_width=68)
    module.draw_line_field(pdf, 360, 233, 157, "Data și ora", label_size=5.5, label_width=57)
    pdf.setFillColor(module.SLATE)
    pdf.setFont("GShop-Bold", 5.8)
    pdf.drawString(36, 208, "ȘTAMPILĂ")
    pdf.drawString(360, 208, "SEMNĂTURĂ CLIENT")
    pdf.setStrokeColor(module.HexColor("#C8D3E3"))
    pdf.setLineWidth(0.85)
    pdf.line(360, 172, 462, 172)
    draw_footer_base(pdf, module, "G-SHOP | CERTIFICAT GARANȚIE")
    pdf.showPage()
    pdf.save()
    return output


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    data = blank_data()
    intake = load_generator("gshop_intake", "generate-intake-estimate-pdfs.py")
    final = load_generator("gshop_final", "generate-final-estimate-pdfs.py")
    service_exit = load_generator("gshop_exit", "generate-service-exit-pdfs.py")
    for module in (intake, final, service_exit):
        module.pdfmetrics = ReadablePdfMetrics(module.pdfmetrics)
    outputs = [
        build_intake(intake, data),
        *build_final_templates(final, data),
        build_exit(service_exit, data),
        build_warranty(final, data),
    ]
    for output in outputs:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
