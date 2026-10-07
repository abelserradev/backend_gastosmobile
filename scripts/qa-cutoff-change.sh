#!/usr/bin/env bash
# QA: cambio de fecha de corte mid-periodo — gastos deben permanecer en tablero
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
PORT=$(grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
PORT=${PORT:-3088}
SECRET_API_KEY=$(grep -E '^SECRET_API_KEY=' "$ENV_FILE" | cut -d= -f2- | tr -d '\r')
BASE="http://127.0.0.1:${PORT}/api"
EMAIL="qa-cutoff-$(date +%s)@example.test"
PASS='QaCutoff1!'

hdr=(-H "Content-Type: application/json" -H "X-API-KEY: ${SECRET_API_KEY}")

reg=$(curl -sS "${hdr[@]}" -X POST "$BASE/auth/register" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"name\":\"QA Cutoff\"}")
TOKEN=$(echo "$reg" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).accessToken')
auth=(-H "Authorization: Bearer $TOKEN" "${hdr[@]}")

curl -sS "${auth[@]}" -X PUT "$BASE/me/preferences" -d '{
  "defaultCurrency":"USD",
  "monthlyIncome": 1000,
  "budgetCycle": { "mode": "monthly_cutoff", "cutoffDay": 15 }
}' >/dev/null

curl -sS "${auth[@]}" -X PUT "$BASE/me/categories" -d '{"categories":[{"name":"Varios"}]}' >/dev/null

prof=$(curl -sS "${auth[@]}" -X POST "$BASE/me/profiles" \
  -d '{"name":"Familia QA","type":"familiar"}')
PID=$(echo "$prof" | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).id')

curl -sS "${auth[@]}" -X POST "$BASE/me/expenses" -d "{
  \"title\":\"Por pagar QA\",
  \"amount\": 50,
  \"categoryName\": \"Varios\",
  \"profileId\": \"$PID\"
}" >/dev/null

curl -sS "${auth[@]}" -X POST "$BASE/me/expenses" -d "{
  \"title\":\"Pagado QA\",
  \"amount\": 30,
  \"categoryName\": \"Varios\",
  \"profileId\": \"$PID\"
}" >/dev/null

paid_id=$(curl -sS "${auth[@]}" "$BASE/me" | node -pe '
const s=JSON.parse(require("fs").readFileSync(0,"utf8"));
const e=s.expenses.find(x=>x.title==="Pagado QA");
if(!e) process.exit(2);
console.log(e.id);
')
curl -sS "${auth[@]}" -X POST "$BASE/me/expenses/mark-paid" \
  -d "{\"expenseIds\":[\"$paid_id\"]}" >/dev/null

before=$(curl -sS "${auth[@]}" "$BASE/me")
echo "$before" | node -e '
const s=JSON.parse(require("fs").readFileSync(0,"utf8"));
console.log(JSON.stringify({
  phase:"before_cutoff_change",
  expenseCount:s.expenses.length,
  activeReferenceMonth:s.activeReferenceMonth,
  cutoffDay:s.preferences.budgetCycle.cutoffDay,
  titles:s.expenses.map(e=>e.title)
}, null, 2));
'

curl -sS "${auth[@]}" -X PUT "$BASE/me/preferences" -d '{
  "defaultCurrency":"USD",
  "monthlyIncome": 1000,
  "budgetCycle": { "mode": "monthly_cutoff", "cutoffDay": 20 }
}' >/dev/null

after=$(curl -sS "${auth[@]}" "$BASE/me")
echo "$after" | node -e '
const s=JSON.parse(require("fs").readFileSync(0,"utf8"));
const ok = s.expenses.length >= 2;
console.log(JSON.stringify({
  phase:"after_cutoff_change",
  expenseCount:s.expenses.length,
  activeReferenceMonth:s.activeReferenceMonth,
  cutoffDay:s.preferences.budgetCycle.cutoffDay,
  titles:s.expenses.map(e=>e.title),
  qaPass: ok
}, null, 2));
process.exit(ok ? 0 : 1);
'
