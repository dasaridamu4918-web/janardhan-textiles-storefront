#!/usr/bin/env python3
"""
Janardhan Textiles — Database Backup Utility (scripts/backup_db.py)
Creates a consistent SQLite snapshot (.db) and JSON export (.json) inside ./backups/.
Usage:
    python scripts/backup_db.py
"""
import datetime
import json
import os
import sqlite3
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT_DIR, "janardan_textiles.db")
BACKUPS_DIR = os.path.join(ROOT_DIR, "backups")


def create_backup():
    if not os.path.exists(DB_PATH):
        print(f"Error: Database file not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    os.makedirs(BACKUPS_DIR, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    sqlite_backup_path = os.path.join(BACKUPS_DIR, f"janardan_textiles-{ts}.db")
    json_backup_path = os.path.join(BACKUPS_DIR, f"janardan_textiles-{ts}.json")

    # 1. Online SQLite backup API (safe even while server.py is running)
    src_conn = sqlite3.connect(DB_PATH)
    dst_conn = sqlite3.connect(sqlite_backup_path)
    with dst_conn:
        src_conn.backup(dst_conn)
    dst_conn.close()

    # 2. Portable JSON export (excluding session tokens and password hashes for safe inspection)
    src_conn.row_factory = sqlite3.Row
    cur = src_conn.cursor()
    export_data = {
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "tables": {}
    }
    for table in ("settings", "products", "orders", "wholesale_enquiries", "contact_messages", "admin_audit_log"):
        try:
            cur.execute(f"SELECT * FROM {table}")
            export_data["tables"][table] = [dict(r) for r in cur.fetchall()]
        except Exception:
            export_data["tables"][table] = []
    src_conn.close()

    with open(json_backup_path, "w", encoding="utf-8") as jf:
        json.dump(export_data, jf, indent=2, ensure_ascii=False)

    print(f"Backup complete:")
    print(f"  SQLite snapshot: {sqlite_backup_path} ({os.path.getsize(sqlite_backup_path)} bytes)")
    print(f"  JSON snapshot:   {json_backup_path} ({os.path.getsize(json_backup_path)} bytes)")
    return sqlite_backup_path, json_backup_path


if __name__ == "__main__":
    create_backup()
