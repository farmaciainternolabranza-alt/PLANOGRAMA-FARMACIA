#!/usr/bin/env python3
"""
Valida consistencia entre data/productos.json y data/muebles.json.

Por defecto genera data/reporte.json y NO falla el workflow. Use --strict
si desea que el workflow falle cuando falten polígonos.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--productos", default="data/productos.json")
    parser.add_argument("--muebles", default="data/muebles.json")
    parser.add_argument("--output", default="data/reporte.json")
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    productos = load_json(repo_root / args.productos)
    muebles = load_json(repo_root / args.muebles)

    expected = {}
    names = {}
    for p in productos:
        idm = str(p.get("id_mueble", "")).strip() or "SIN_ID"
        zone = str(p.get("ubicacion", "")).strip()
        expected.setdefault(idm, set()).add(zone)
        names[idm] = str(p.get("mueble", "")).strip()

    missing_zone = []
    missing_poly = []
    for idm, zones in sorted(expected.items()):
        mueble = muebles.get(idm)
        if not mueble:
            missing_zone.append({"id_mueble": idm, "mueble": names.get(idm, ""), "ubicaciones": sorted(zones)})
            continue

        defined_zones = mueble.get("zones", {})
        for zone in sorted(zones):
            z = defined_zones.get(zone)
            if not z:
                missing_zone.append({"id_mueble": idm, "mueble": names.get(idm, ""), "ubicacion": zone})
            elif not z.get("poly_norm"):
                missing_poly.append({"id_mueble": idm, "mueble": names.get(idm, ""), "ubicacion": zone, "notes": z.get("notes", "")})

    report = {
        "total_productos": len(productos),
        "total_muebles_excel": len(expected),
        "total_zonas_excel": sum(len(v) for v in expected.values()),
        "zonas_sin_entrada_en_muebles_json": missing_zone,
        "zonas_sin_poligono": missing_poly,
    }

    out = repo_root / args.output
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"OK: reporte escrito en {out.relative_to(repo_root)}")
    print(f"Zonas sin entrada: {len(missing_zone)}")
    print(f"Zonas sin polígono: {len(missing_poly)}")

    if args.strict and (missing_zone or missing_poly):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
