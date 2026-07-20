"""
Load constituency boundary shapefiles into PostGIS.

Source data (see boundaries/DATA_QUALITY_NOTES.md for caveats per file):
- Parliamentary constituencies (Lok Sabha): boundaries/parliamentary-constituencies/india_pc_2019.shp
- Assembly constituencies (Vidhan Sabha):   boundaries/assembly-constituencies/India_AC.shp

Run from the app/ directory (same convention as db/connect.py's imports):
    cd app && python update_boundries.py

Requires the GDAL command-line tools (ogr2ogr) to be installed and on PATH.
"""
import shutil
import subprocess
import sys
from pathlib import Path

from sqlalchemy import text

from config.settings import get_settings
from db.connect import engine

BOUNDARIES_DIR = Path(__file__).resolve().parent.parent / "boundaries"

SHAPEFILES = [
    {
        "path": BOUNDARIES_DIR / "parliamentary-constituencies" / "india_pc_2019.shp",
        "table": "parliamentary_constituencies",
    },
    {
        "path": BOUNDARIES_DIR / "assembly-constituencies" / "India_AC.shp",
        "table": "assembly_constituencies",
    },
]


def ensure_postgis() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))


def load_shapefile(ogr2ogr: str, db_url: str, shp_path: Path, table_name: str) -> None:
    if not shp_path.exists():
        raise FileNotFoundError(f"Shapefile not found: {shp_path}")

    cmd = [
        ogr2ogr,
        "-f", "PostgreSQL",
        f"PG:{db_url}",
        str(shp_path),
        "-nln", table_name,
        "-nlt", "PROMOTE_TO_MULTI",
        "-lco", "GEOMETRY_NAME=geom",
        "-lco", "FID=id",
        "-lco", "SPATIAL_INDEX=GIST",
        "-t_srs", "EPSG:4326",
        "-overwrite",
        "-progress",
    ]
    subprocess.run(cmd, check=True)


def main() -> None:
    settings = get_settings()

    ogr2ogr = shutil.which("ogr2ogr")
    if not ogr2ogr:
        sys.exit(
            "ogr2ogr not found on PATH. Install GDAL (e.g. via Postgres.app, "
            "`brew install gdal`, or conda) before running this script."
        )

    ensure_postgis()

    for shp in SHAPEFILES:
        load_shapefile(ogr2ogr, settings.DB_URL, shp["path"], shp["table"])


if __name__ == "__main__":
    main()
