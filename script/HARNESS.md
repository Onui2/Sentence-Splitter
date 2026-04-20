# HAR Harness

Use this harness to inspect browser HAR captures without leaking auth material.
It scans `attached_assets/*.har` by default and redacts cookies, auth tokens,
credentials, passwords, session identifiers, and bearer tokens.

## Commands

```sh
npm run harness
npm run harness:all
npm run harness -- --keyword question --keyword paper --limit 20
npm run harness -- --all --only-api --method POST --limit 0
npm run harness:json
```

## Useful Flags

- `--all`: include every request instead of the default auth/login/branch filter.
- `--keyword <text>`: filter request URL, headers, and body. Repeatable.
- `--host <host>`: restrict to a host such as `www.flipedu.net`.
- `--method <GET|POST|PUT|DELETE>`: restrict to one or more methods.
- `--status <code>`: restrict to a response status.
- `--only-api`: include only URLs whose path contains `/api/`.
- `--hide-body` / `--hide-headers` / `--hide-query`: trim output when needed.
- `--json`: emit sanitized machine-readable output.
