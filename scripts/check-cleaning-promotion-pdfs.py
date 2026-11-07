"""Validate actual rendered PDFs, portrait paper size, advert count and contact links."""
from pathlib import Path
from pypdf import PdfReader
import re

ROOT = Path(__file__).resolve().parents[1]
expected = {'Exemplu-curatatorie-intake.pdf': 2, 'Exemplu-curatatorie-exit.pdf': 2,
            'Exemplu-curatatorie-dosar.pdf': 3, 'Carte-de-vizita-Curatatorie-Canapele.pdf': 1}
for name, count in expected.items():
    reader = PdfReader(ROOT / 'output/pdf' / name)
    assert len(reader.pages) == count, name
    for page in reader.pages:
        assert abs(float(page.mediabox.width) - 595.28) < 1
        assert abs(float(page.mediabox.height) - 841.89) < 1
    links = [a.get_object()['/A']['/URI'] for a in reader.pages[-1]['/Annots']]
    assert len(links) == 5 and 'tel:+40726049278' in links
    assert 'mailto:contact@curatatorie-canapele.ro' in links
    assert sum(bool(page.get('/Annots')) for page in reader.pages) == 1, 'Advert duplicated'
    drawn = re.findall(rb'/I\d+ Do', reader.pages[-1].get_contents().get_data())
    assert len(drawn) == 1
    print(f'OK: {name}: {count} A4 portrait pages, one advert, five contact links')
reader = PdfReader(ROOT / 'output/pdf/Exemplu-curatatorie-dosar.pdf')
assert 'FIȘĂ DE INTRARE A COMENZII' in reader.pages[0].extract_text()
assert 'FIȘĂ DE IEȘIRE A COMENZII' in reader.pages[1].extract_text()
assert 'IN-CC-2026-00001' in reader.pages[1].extract_text()
reader = PdfReader(ROOT / 'tmp/pdfs/cleaning-pagination-test.pdf')
assert len(reader.pages) > 2 and len(reader.pages[-1].get('/Annots', [])) == 5
print('OK: dossier order, intake reference, multipage order advert is last')
