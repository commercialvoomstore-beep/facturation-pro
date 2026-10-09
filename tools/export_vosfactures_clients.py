#!/usr/bin/env python3
"""Exporte les clients VosFactures vers XLSX et/ou SQL sans stocker le token.

Le token doit être fourni uniquement par la variable d'environnement
VOSFACTURES_API_TOKEN. Le script ne journalise jamais l'URL complète de l'API.

Exemple :
  VOSFACTURES_API_TOKEN='nouveau-token' \
    python3 tools/export_vosfactures_clients.py \
      --xlsx exports/vosfactures_clients.xlsx \
      --sql exports/vosfactures_clients.sql

Le script utilise uniquement la bibliothèque standard Python.
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path
from typing import Any

API_URL = "https://voomstore.vosfactures.fr/clients.json"
PAGE_SIZE = 25
MAX_PAGES = 10_000

COLUMNS = [
    "source",
    "external_id",
    "nom",
    "nom_usage_interne",
    "numero_fiscal",
    "emails",
    "telephones",
    "contact",
    "address",
    "city",
    "country",
    "post_code",
    "register_number",
    "numero_registre",
    "external_created_at",
    "external_updated_at",
    "created_at",
    "updated_at",
]


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def clean_name(value: Any) -> str:
    return re.sub(r"^[.·•]+\s*", "", clean(value)).strip()


def unique_join(values: list[Any], separator: str = " ; ") -> str:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = clean(value)
        key = item.casefold()
        if item and key not in seen:
            seen.add(key)
            result.append(item)
    return separator.join(result)


def iso_date(value: Any) -> str:
    text = clean(value)
    if not text:
        return ""
    try:
        normalized = text.replace("Z", "+00:00")
        parsed = dt.datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    except ValueError:
        return ""


def map_client(client: dict[str, Any]) -> dict[str, str] | None:
    external_id = clean(client.get("id"))
    if not external_id:
        return None

    first_name = clean_name(client.get("first_name"))
    last_name = clean_name(client.get("last_name"))
    contact = " ".join(part for part in (first_name, last_name) if part)
    name = (
        clean_name(client.get("name"))
        or contact
        or clean_name(client.get("shortcut"))
        or f"Client VosFactures {external_id}"
    )
    street = " ".join(
        part for part in (clean(client.get("street_no")), clean(client.get("street"))) if part
    )
    address = ", ".join(
        part
        for part in (
            street,
            clean(client.get("post_code")),
            clean(client.get("city")),
            clean(client.get("country")),
        )
        if part
    )
    created_at = iso_date(client.get("created_at"))
    updated_at = iso_date(client.get("updated_at"))

    return {
        "source": "vosfactures",
        "external_id": external_id,
        "nom": name,
        "nom_usage_interne": clean_name(client.get("shortcut")),
        "numero_fiscal": clean(client.get("tax_no")),
        "emails": clean(client.get("email")),
        "telephones": unique_join([client.get("phone"), client.get("mobile_phone")]),
        "contact": contact,
        "address": address,
        "city": clean(client.get("city")),
        "country": clean(client.get("country")),
        "post_code": clean(client.get("post_code")),
        "register_number": clean(client.get("register_number")),
        "numero_registre": clean(client.get("register_number")),
        "external_created_at": created_at,
        "external_updated_at": updated_at,
        "created_at": created_at,
        "updated_at": updated_at,
    }


def fetch_clients(token: str) -> list[dict[str, str]]:
    clients: list[dict[str, str]] = []
    seen: set[str] = set()

    for page in range(1, MAX_PAGES + 1):
        query = urllib.parse.urlencode(
            {"page": page, "per_page": PAGE_SIZE, "api_token": token}
        )
        request = urllib.request.Request(
            f"{API_URL}?{query}",
            headers={"Accept": "application/json", "User-Agent": "facturation-pro-export/1.0"},
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise RuntimeError(
                f"VosFactures a refusé la page {page} (HTTP {error.code}). "
                "Vérifiez le token configuré dans l'environnement."
            ) from error
        except (urllib.error.URLError, TimeoutError) as error:
            raise RuntimeError(f"Connexion à VosFactures impossible à la page {page}.") from error
        except json.JSONDecodeError as error:
            raise RuntimeError(f"Réponse JSON VosFactures invalide à la page {page}.") from error

        if not isinstance(payload, list):
            raise RuntimeError("Réponse VosFactures inattendue : la liste de clients est absente.")

        for raw_client in payload:
            if not isinstance(raw_client, dict):
                continue
            client = map_client(raw_client)
            if client and client["external_id"] not in seen:
                seen.add(client["external_id"])
                clients.append(client)

        print(f"Page {page} : {len(payload)} fiche(s) reçue(s).", file=sys.stderr)
        if len(payload) < PAGE_SIZE:
            return clients

    raise RuntimeError("La pagination VosFactures a dépassé la limite de sécurité.")


def sql_literal(value: str, *, null_when_empty: bool = False) -> str:
    if value == "" and null_when_empty:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def sql_value(column: str, value: str) -> str:
    if column in {"created_at", "updated_at"} and not value:
        return "timezone('utc', now())"
    return sql_literal(value, null_when_empty=column.startswith("external_"))


def write_sql(path: Path, clients: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "-- Généré par tools/export_vosfactures_clients.py.",
        "-- Ne contient pas le token VosFactures.",
        "-- Exécuter d'abord supabase/contacts-write.sql dans Supabase SQL Editor.",
        "-- Les fiches sont dédupliquées par (source, external_id).",
        "",
        "begin;",
        "",
    ]
    insert_columns = ", ".join(COLUMNS)
    update_columns = [column for column in COLUMNS if column not in {"source", "external_id"}]
    update_clause = ",\n  ".join(
        f"{column} = excluded.{column}" for column in update_columns
    )

    batch_size = 200
    for start in range(0, len(clients), batch_size):
        batch = clients[start : start + batch_size]
        lines.append(f"insert into public.contacts ({insert_columns}) values")
        value_rows = []
        for client in batch:
            values = ", ".join(sql_value(column, client.get(column, "")) for column in COLUMNS)
            value_rows.append(f"  ({values})")
        lines.append(",\n".join(value_rows))
        lines.append("on conflict (source, external_id) do update set")
        lines.append(f"  {update_clause};")
        lines.append("")

    lines.extend(["commit;", ""])
    path.write_text("\n".join(lines), encoding="utf-8")


def xml_cell(value: str) -> str:
    return f'<c t="inlineStr"><is><t xml:space="preserve">{html.escape(value)}</t></is></c>'


def write_xlsx(path: Path, clients: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [COLUMNS] + [[client.get(column, "") for column in COLUMNS] for client in clients]

    worksheet_rows: list[str] = []
    for row_number, row in enumerate(rows, start=1):
        cells = "".join(xml_cell(str(value)) for value in row)
        worksheet_rows.append(f'<row r="{row_number}">{cells}</row>')

    worksheet = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:Q{last_row}"/>
  <sheetData>
    {rows}
  </sheetData>
</worksheet>
""".format(last_row=len(rows), rows="\n    ".join(worksheet_rows))

    content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>
"""
    root_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"""
    workbook = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Clients" sheetId="1" r:id="rId1"/></sheets>
</workbook>
"""
    workbook_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>
"""

    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", type=Path, help="Chemin du fichier Excel à produire")
    parser.add_argument("--sql", type=Path, help="Chemin du script SQL à produire")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.xlsx and not args.sql:
        print("Indiquez --xlsx, --sql ou les deux.", file=sys.stderr)
        return 2

    token = os.environ.get("VOSFACTURES_API_TOKEN", "").strip()
    if not token:
        print(
            "VOSFACTURES_API_TOKEN n'est pas défini. Ne mettez pas le token dans le script ni dans Git.",
            file=sys.stderr,
        )
        return 2

    try:
        clients = fetch_clients(token)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        return 1

    if args.xlsx:
        write_xlsx(args.xlsx, clients)
        print(f"Excel créé : {args.xlsx} ({len(clients)} client(s)).")
    if args.sql:
        write_sql(args.sql, clients)
        print(f"SQL créé : {args.sql} ({len(clients)} client(s)).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
