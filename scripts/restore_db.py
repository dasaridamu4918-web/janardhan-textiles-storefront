#!/usr/bin/env python3
"""
Janardhan Textiles — Database Restore Utility (scripts/restore_db.py)
Restores janardan_textiles.db from a backup .db or .json snapshot in ./backups/.
Usage:
    python scripts/restore_db.py <path-to-backup.db-or-.json>
"""
import datetime
import json
import os
import shutil
import sqlite3
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT_DIR, "janardan_textiles.db")
BACKUPS_DIR = os.path.join(ROOT_DIR, "backups")


def restore_backup(source_path):
    if not os.path.exists(source_path):
        print(f"Error: Backup file not found: {source_path}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(BACKUPS_DIR, exist_ok=True)
    if os.path.exists(DB_PATH):
        pre_restore = os.path.join(
            BACKUPS_DIR,
            f"pre-restore-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
        )
        shutil.copyfile(DB_PATH, pre_restore)
        print(f"Saved pre-restore safety snapshot to: {pre_restore}")

    if source_path.lower().endswith(".db"):
        src_conn = sqlite3.connect(source_path)
        dst_conn = sqlite3.connect(DB_PATH)
        with dst_conn:
            src_conn.backup(dst_conn)
        dst_conn.close()
        src_conn.close()
        print(f"Successfully restored SQLite database from {source_path}")
        return

    if source_path.lower().endswith(".json"):
        with open(source_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        tables = data.get("tables") or {}
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        for tname, rows in tables.items():
            if not rows or tname not in ("settings", "products", "orders", "wholesale_enquiries", "contact_messages"):
                continue
            cur.execute(f"DELETE FROM {tname}")
            cols = list(rows[0].keys())
            placeholders = ",".join("?" for _ in cols)
            col_names = ",".join(cols)
            for r in rows:
                cur.execute(
                    f"INSERT INTO {tname} ({col_names}) VALUES ({placeholders})",
                    tuple(r.get(c) for c in cols)
                )
        conn.commit()
        conn.close()
        print(f"Successfully restored tables from JSON snapshot {source_path}")
        return

    print("Error: Unsupported backup file extension. Use .db or .json.", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/restore_db.py <path-to-backup.db-or-.json>", file=sys.stderr)
        sys.exit(1)
    restore_backup(sys.argv[1])
