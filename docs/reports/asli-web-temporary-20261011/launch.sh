#!/bin/zsh
# Foreground command for a managed exec session; keep this session alive for the endpoint.
set -eu
lane=${0:A:h}
home_dir=$lane/private/home
cli=/Users/run176504/.codex-chatgpt-web/versions/6.1.7-darwin-arm64/bin/codex-chatgpt-web
[[ -f $home_dir/config.json ]] || { print -u2 'Run bootstrap.mjs with installed Bun first'; exit 1; }
if lsof -nP -iTCP:17842 -sTCP:LISTEN > /dev/null; then
 print -u2 'Port 17842 occupied; refuse to replace any process'; exit 1
fi
exec "$cli" --home "$home_dir" serve < /dev/null
