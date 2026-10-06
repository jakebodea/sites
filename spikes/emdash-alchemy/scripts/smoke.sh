#!/usr/bin/env bash
# Smoke-test a built EmDash bundle in local workerd via wrangler dev (no Cloudflare account).
# Usage: scripts/smoke.sh <dist-dir> <port>
set -u
dir=$1; port=$2; log=/tmp/smoke-$port.log
rm -rf ".wrangler-$port"
bunx wrangler dev -c "$dir/server/wrangler.json" --port "$port" --local --test-scheduled --persist-to ".wrangler-$port" > "$log" 2>&1 &
pid=$!
for _ in $(seq 60); do curl -s -o /dev/null "http://localhost:$port/" && break; sleep 1; done
for round in 1; do
  for p in / /pricing /contact /_emdash/admin /_emdash/admin/setup /_emdash/api/manifest /_emdash/api/setup/status; do
    out=$(curl -s -o /tmp/smoke-body -w "%{http_code} %{redirect_url}" "http://localhost:$port$p")
    title=$(grep -o '<title>[^<]*</title>' /tmp/smoke-body | head -1)
    echo "round $round $out $p $title"
  done
done
echo "scheduled: $(curl -s -o /tmp/smoke-sched -w "%{http_code}" "http://localhost:$port/cdn-cgi/handler/scheduled?cron=*+*+*+*+*") $(head -c 120 /tmp/smoke-sched)"
kill $pid 2>/dev/null; wait $pid 2>/dev/null
grep -iE "error|exception|✘|scheduled|cron" "$log" | grep -v "chunks/"  | grep -v "^\s*$" | head -8
