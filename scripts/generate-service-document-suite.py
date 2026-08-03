from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA = ROOT / "examples" / "service-document-data.json"
DEFAULT_OUTPUT = ROOT / "output" / "pdf"

GENERATORS = (
    (
        ROOT / "scripts" / "generate-intake-estimate-pdfs.py",
        "fise-intrare-service-g-shop",
    ),
    (
        ROOT / "scripts" / "generate-final-estimate-pdfs.py",
        "devize-finale-g-shop",
    ),
    (
        ROOT / "scripts" / "generate-service-exit-pdfs.py",
        "fise-iesire-service-g-shop",
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generează setul complet de documente service G-Shop."
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=DEFAULT_DATA,
        help="JSON comun cu datele firmei, clientului, echipamentului și documentelor.",
    )
    parser.add_argument(
        "--company-mode",
        choices=("with", "without", "both"),
        default="with",
        help="Implicit generează documentele cu datele firmei.",
    )
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data_path = args.data.resolve()
    if not data_path.exists():
        raise FileNotFoundError(f"Fișierul cu date nu există: {data_path}")

    output_root = args.output_root.resolve()
    for generator, folder in GENERATORS:
        command = [
            sys.executable,
            str(generator),
            "--data",
            str(data_path),
            "--output",
            str(output_root / folder),
            "--company-mode",
            args.company_mode,
        ]
        print(f"\n[{folder}]")
        subprocess.run(command, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
