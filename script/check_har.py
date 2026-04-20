#!/usr/bin/env python3
"""Small HAR inspection harness for FlipEdu request discovery.

The harness scans one or more .har files, filters interesting requests, and
prints a redacted summary. It is intentionally stdlib-only so it can run in this
repo without installing extra dependencies.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit


DEFAULT_KEYWORDS = ("auth", "login", "partner", "branch")
DEFAULT_HAR_GLOB = "attached_assets/*.har"
SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-auth-token",
    "x-csrf-token",
    "x-xsrf-token",
}
SENSITIVE_EXACT_KEYS = {"auth", "user_id", "userid", "username"}
SENSITIVE_KEY_PARTS = ("authorization", "cookie", "credential", "jwt", "password", "secret", "session", "token")
BEARER_RE = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)


def truncate(value: str, limit: int) -> str:
    if limit <= 0 or len(value) <= limit:
        return value
    return value[: max(0, limit - 3)] + "..."


def is_sensitive_key(key: str) -> bool:
    normalized = key.lower()
    return (
        normalized in SENSITIVE_HEADERS
        or normalized in SENSITIVE_EXACT_KEYS
        or any(part in normalized for part in SENSITIVE_KEY_PARTS)
    )


def redact_scalar(key: str, value: Any, text_limit: int) -> Any:
    if is_sensitive_key(key):
        return "<redacted>"
    if isinstance(value, str):
        return truncate(BEARER_RE.sub("Bearer <redacted>", value), text_limit)
    return value


def redact_obj(value: Any, text_limit: int) -> Any:
    if isinstance(value, dict):
        return {
            str(k): ("<redacted>" if is_sensitive_key(str(k)) else redact_obj(v, text_limit))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact_obj(item, text_limit) for item in value]
    if isinstance(value, str):
        return truncate(BEARER_RE.sub("Bearer <redacted>", value), text_limit)
    return value


def redact_headers(headers: list[dict[str, Any]], text_limit: int) -> dict[str, Any]:
    redacted: dict[str, Any] = {}
    for header in headers:
        name = str(header.get("name", ""))
        value = header.get("value", "")
        if not name:
            continue
        redacted[name] = redact_scalar(name, value, text_limit)
    return redacted


def redact_text(text: str, mime_type: str | None, text_limit: int) -> str:
    stripped = text.strip()
    if not stripped:
        return ""

    if "json" in (mime_type or "").lower() or stripped[:1] in "[{":
        try:
            parsed = json.loads(stripped)
            return truncate(json.dumps(redact_obj(parsed, text_limit), ensure_ascii=False), text_limit)
        except json.JSONDecodeError:
            pass

    if "=" in stripped and "&" in stripped:
        pairs = parse_qsl(stripped, keep_blank_values=True)
        return urlencode(
            [(key, "<redacted>" if is_sensitive_key(key) else truncate(value, text_limit)) for key, value in pairs]
        )

    sanitized = BEARER_RE.sub("Bearer <redacted>", stripped)
    sanitized = re.sub(
        r"(?i)\b(password|credential|token|secret|authorization|cookie)=([^&\s]+)",
        lambda match: f"{match.group(1)}=<redacted>",
        sanitized,
    )
    return truncate(sanitized, text_limit)


def load_har(path: Path) -> tuple[list[dict[str, Any]], str | None]:
    try:
        with path.open("r", encoding="utf-8-sig") as file:
            har = json.load(file)
    except Exception as exc:  # noqa: BLE001 - CLI should report parse/load failures cleanly.
        return [], f"{path}: {exc}"

    entries = har.get("log", {}).get("entries", [])
    if not isinstance(entries, list):
        return [], f"{path}: log.entries is not a list"
    return entries, None


def request_search_text(entry: dict[str, Any]) -> str:
    request = entry.get("request", {})
    parts = [
        str(request.get("method", "")),
        str(request.get("url", "")),
        str(request.get("postData", {}).get("text", "")),
    ]
    return " ".join(parts).lower()


def matches_entry(
    entry: dict[str, Any],
    *,
    all_entries: bool,
    keywords: list[str],
    hosts: set[str],
    methods: set[str],
    statuses: set[int],
    only_api: bool,
) -> bool:
    request = entry.get("request", {})
    response = entry.get("response", {})
    url = str(request.get("url", ""))
    parsed = urlsplit(url)

    if hosts and parsed.netloc.lower() not in hosts:
        return False
    if methods and str(request.get("method", "")).upper() not in methods:
        return False
    if statuses and int(response.get("status", 0) or 0) not in statuses:
        return False
    if only_api and "/api/" not in parsed.path:
        return False
    if all_entries:
        return True
    haystack = request_search_text(entry)
    return any(keyword.lower() in haystack for keyword in keywords)


def entry_to_record(path: Path, entry: dict[str, Any], text_limit: int) -> dict[str, Any]:
    request = entry.get("request", {})
    response = entry.get("response", {})
    url = str(request.get("url", ""))
    parsed = urlsplit(url)
    post_data = request.get("postData") or {}
    post_text = str(post_data.get("text", ""))
    mime_type = post_data.get("mimeType")

    query = {}
    for item in request.get("queryString", []):
        name = str(item.get("name", ""))
        if not name:
            continue
        query[name] = redact_scalar(name, item.get("value", ""), text_limit)

    return {
        "file": str(path),
        "startedDateTime": entry.get("startedDateTime"),
        "method": request.get("method"),
        "status": response.get("status"),
        "statusText": response.get("statusText"),
        "host": parsed.netloc,
        "path": parsed.path,
        "url": url,
        "query": query,
        "headers": redact_headers(request.get("headers", []), text_limit),
        "body": redact_text(post_text, str(mime_type) if mime_type else None, text_limit) if post_text else "",
    }


def discover_har_paths(paths: list[str]) -> list[Path]:
    if paths:
        discovered = [Path(path) for path in paths]
    else:
        discovered = sorted(Path(".").glob(DEFAULT_HAR_GLOB))
    return [path for path in discovered if path.exists() and path.is_file()]


def print_text(records_by_file: dict[str, list[dict[str, Any]]], args: argparse.Namespace) -> None:
    records = [record for file_records in records_by_file.values() for record in file_records]
    host_counts = Counter(record["host"] or "<relative>" for record in records)
    status_counts = Counter(str(record["status"]) for record in records)
    method_counts = Counter(str(record["method"]) for record in records)

    print("HAR harness")
    print(f"Matched requests: {len(records)}")
    if records:
        print("Hosts: " + ", ".join(f"{host}={count}" for host, count in host_counts.most_common()))
        print("Methods: " + ", ".join(f"{method}={count}" for method, count in method_counts.most_common()))
        print("Statuses: " + ", ".join(f"{status}={count}" for status, count in status_counts.most_common()))
    print()

    if args.summary_only:
        return

    for file_name, file_records in records_by_file.items():
        print(file_name)
        for record in file_records:
            print(f"  [{record['status']}] {record['method']} {record['url']}")
            if args.show_query and record["query"]:
                print(f"    query: {json.dumps(record['query'], ensure_ascii=False)}")
            if args.show_headers:
                visible_headers = {
                    key: value
                    for key, value in record["headers"].items()
                    if key.lower() in SENSITIVE_HEADERS
                    or key.lower() in {"accept", "content-type", "origin", "referer", "user-agent"}
                }
                if visible_headers:
                    print(f"    headers: {json.dumps(visible_headers, ensure_ascii=False)}")
            if args.show_body and record["body"]:
                print(f"    body: {record['body']}")
        print()


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Inspect and redact matching requests from HAR files.")
    parser.add_argument("paths", nargs="*", help="HAR files to scan. Defaults to attached_assets/*.har.")
    parser.add_argument("-k", "--keyword", action="append", help="Filter keyword. Can be repeated.")
    parser.add_argument("--all", action="store_true", help="Include all requests instead of keyword matches.")
    parser.add_argument("--host", action="append", help="Restrict to an exact host, e.g. www.flipedu.net.")
    parser.add_argument("--method", action="append", help="Restrict to an HTTP method. Can be repeated.")
    parser.add_argument("--status", action="append", type=int, help="Restrict to a status code. Can be repeated.")
    parser.add_argument("--only-api", action="store_true", help="Only include URLs whose path contains /api/.")
    parser.add_argument("--limit", type=int, default=30, help="Max matching requests to print. Use 0 for no limit.")
    parser.add_argument("--text-limit", type=int, default=300, help="Max chars for body/header string fields.")
    parser.add_argument("--json", action="store_true", help="Print sanitized JSON instead of text.")
    parser.add_argument("--summary-only", action="store_true", help="Only print aggregate counts.")
    parser.add_argument("--show-query", action="store_true", default=True, help="Show query parameters.")
    parser.add_argument("--hide-query", action="store_false", dest="show_query", help="Hide query parameters.")
    parser.add_argument("--show-headers", action="store_true", default=True, help="Show selected headers.")
    parser.add_argument("--hide-headers", action="store_false", dest="show_headers", help="Hide headers.")
    parser.add_argument("--show-body", action="store_true", default=True, help="Show redacted request bodies.")
    parser.add_argument("--hide-body", action="store_false", dest="show_body", help="Hide request bodies.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    keywords = args.keyword or list(DEFAULT_KEYWORDS)
    paths = discover_har_paths(args.paths)
    if not paths:
        print(f"No HAR files found. Pass paths explicitly or add files under {DEFAULT_HAR_GLOB}.", file=sys.stderr)
        return 1

    hosts = {host.lower() for host in args.host or []}
    methods = {method.upper() for method in args.method or []}
    statuses = set(args.status or [])
    records_by_file: dict[str, list[dict[str, Any]]] = defaultdict(list)
    total_matched = 0
    errors: list[str] = []

    for path in paths:
        entries, error = load_har(path)
        if error:
            errors.append(error)
            continue
        for entry in entries:
            if not matches_entry(
                entry,
                all_entries=args.all,
                keywords=keywords,
                hosts=hosts,
                methods=methods,
                statuses=statuses,
                only_api=args.only_api,
            ):
                continue
            total_matched += 1
            if args.limit and total_matched > args.limit:
                continue
            records_by_file[str(path)].append(entry_to_record(path, entry, args.text_limit))

    if args.json:
        print(json.dumps(records_by_file, indent=2, ensure_ascii=False))
    else:
        print_text(records_by_file, args)

    for error in errors:
        print(f"warning: {error}", file=sys.stderr)
    if args.limit and total_matched > args.limit:
        print(f"note: {total_matched - args.limit} more matching requests hidden by --limit={args.limit}", file=sys.stderr)
    return 0 if not errors else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
