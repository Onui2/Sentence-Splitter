import json
import sys

with open('attached_assets/editor.flipedu.net_1774436569239.har', 'r') as f:
    har = json.load(f)

entries = har.get('log', {}).get('entries', [])
keywords = ['auth', 'login', 'partner', 'branch']
auth_entries = [e for e in entries if any(k in e['request']['url'].lower() for k in keywords)]

for e in auth_entries[:15]:
    req = e['request']
    resp = e['response']
    print(f'[{resp["status"]}] {req["method"]} {req["url"]}')
    if req.get('postData'):
        print(f'  Body: {req["postData"].get("text", "")[:300]}')
    headers = {h["name"].lower(): h["value"] for h in req.get("headers", [])}
    if 'x-auth-token' in headers:
        print(f'  x-auth-token: {headers["x-auth-token"][:40]}...')
    if 'cookie' in headers:
        print(f'  cookie: {headers["cookie"][:80]}...')
    print()
