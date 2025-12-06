import os
import json
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
DASH_DIR = os.path.join(ROOT, "dashboards")
OUT_PATH = os.path.join(ROOT, "manifest.json")


def main():
    if not os.path.isdir(DASH_DIR):
        raise SystemExit(f"'dashboards' folder not found at {DASH_DIR}")

    entries = []
    for name in os.listdir(DASH_DIR):
        if not name.lower().endswith(".html"):
            continue
        full_path = os.path.join(DASH_DIR, name)
        if not os.path.isfile(full_path):
            continue

        mtime = os.path.getmtime(full_path)
        entries.append(
            {
                "path": f"dashboards/{name}",
                "filename": name,
                "modified": datetime.fromtimestamp(mtime).isoformat(timespec="seconds"),
            }
        )

    # Newest first
    entries.sort(key=lambda e: e["modified"], reverse=True)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)

    print(f"Wrote {len(entries)} entries to manifest.json")


if __name__ == "__main__":
    main()
