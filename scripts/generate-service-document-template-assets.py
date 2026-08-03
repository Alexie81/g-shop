from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType

from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "api" / "assets" / "service-document-templates"


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
    pdf.line(module.MARGIN, 30, module.PAGE_W - module.MARGIN, 30)
    pdf.setFillColor(module.SLATE)
    pdf.setFont("GShop-Regular", 4.45)
    pdf.drawString(
        module.MARGIN,
        18,
        "În temeiul legii: OG 21/1992 | Legea 193/2000 | Codul civil | GDPR (UE) 2016/679 | Legea 190/2018.",
    )
    pdf.setFillColor(module.ELECTRIC_DARK)
    pdf.setFont("GShop-Bold", 5.3)
    pdf.drawRightString(module.PAGE_W - module.MARGIN, 9, label)


def build_intake(module: ModuleType, data: dict[str, object]) -> Path:
    output = OUTPUT / "intake.pdf"
    module.register_fonts()
    pdf = canvas.Canvas(str(output), pagesize=module.A4, pageCompression=1)
    pdf.setTitle("Șablon fișă de intrare G-Shop")

    module.draw_background(pdf)
    module.draw_header(pdf, data)
    module.draw_company(pdf, data)
    module.draw_client_and_equipment(pdf, data)
    module.draw_problem(pdf, data)
    module.draw_estimated_costs(pdf, data, section_y=324, box_y=72, height=234, number=3)
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
    pdf.drawString(module.MARGIN + 12, 513, "CONDIȚII REPARAȚIE")
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
    pdf = canvas.Canvas(str(intro), pagesize=module.A4, pageCompression=1)
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
    pdf = canvas.Canvas(str(continuation), pagesize=module.A4, pageCompression=1)
    pdf.setTitle("Șablon deviz final - pagină articole G-Shop")
    module.draw_background(pdf)
    module.draw_header(pdf, data, continuation=True)
    module.draw_reference_band(pdf, data, 724)
    draw_footer_base(pdf, module, "G-SHOP | DEVIZ FINAL")
    pdf.showPage()
    pdf.save()
    outputs.append(continuation)

    agreement = OUTPUT / "final-estimate-agreement.pdf"
    pdf = canvas.Canvas(str(agreement), pagesize=module.A4, pageCompression=1)
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
    pdf = canvas.Canvas(str(output), pagesize=module.A4, pageCompression=1)
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


def main() -> int:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    data = blank_data()
    intake = load_generator("gshop_intake", "generate-intake-estimate-pdfs.py")
    final = load_generator("gshop_final", "generate-final-estimate-pdfs.py")
    service_exit = load_generator("gshop_exit", "generate-service-exit-pdfs.py")
    outputs = [build_intake(intake, data), *build_final_templates(final, data), build_exit(service_exit, data)]
    for output in outputs:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
