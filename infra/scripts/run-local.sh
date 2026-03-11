#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN_DIR="${ROOT_DIR}/.run-local"
LOG_DIR="${RUN_DIR}/logs"
PID_DIR="${RUN_DIR}/pids"

DB_CONTAINER="${METERIA_DB_CONTAINER:-meteria-postgres-local}"
DB_PORT="${METERIA_DB_PORT:-5434}"
DB_URL="postgresql://meteria:meteria@localhost:${DB_PORT}/meteria?schema=public"

mkdir -p "${LOG_DIR}" "${PID_DIR}"

api_pid_file="${PID_DIR}/api.pid"
web_pid_file="${PID_DIR}/web.pid"
worker_pid_file="${PID_DIR}/worker.pid"

is_pid_running() {
  local pid="$1"
  kill -0 "${pid}" >/dev/null 2>&1
}

kill_from_pid_file() {
  local file="$1"
  if [[ -f "${file}" ]]; then
    local pid
    pid="$(cat "${file}")"
    if [[ -n "${pid}" ]] && is_pid_running "${pid}"; then
      kill "${pid}" >/dev/null 2>&1 || true
    fi
    rm -f "${file}"
  fi
}

start_db() {
  if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "DB container already running: ${DB_CONTAINER}"
    return
  fi

  if docker ps -a --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    docker start "${DB_CONTAINER}" >/dev/null
  else
    docker run -d \
      --name "${DB_CONTAINER}" \
      -e POSTGRES_USER=meteria \
      -e POSTGRES_PASSWORD=meteria \
      -e POSTGRES_DB=meteria \
      -p "${DB_PORT}:5432" \
      timescale/timescaledb:2.17.2-pg16 >/dev/null
  fi

  echo "Waiting for database on port ${DB_PORT}..."
  for _ in {1..40}; do
    if docker exec "${DB_CONTAINER}" pg_isready -U meteria -d meteria >/dev/null 2>&1; then
      echo "Database is ready."
      return
    fi
    sleep 1
  done

  echo "Database did not become ready in time."
  exit 1
}

prepare_db() {
  (
    cd "${ROOT_DIR}"
    DATABASE_URL="${DB_URL}" DIRECT_DATABASE_URL="${DB_URL}" \
      npx prisma db push --schema packages/db/prisma/schema.prisma >/dev/null
    DATABASE_URL="${DB_URL}" DIRECT_DATABASE_URL="${DB_URL}" \
      npm run db:seed >/dev/null
  )
}

start_api() {
  if [[ -f "${api_pid_file}" ]] && is_pid_running "$(cat "${api_pid_file}")"; then
    echo "API already running."
    return
  fi

  (
    cd "${ROOT_DIR}"
    nohup env \
      DATABASE_URL="${DB_URL}" \
      DIRECT_DATABASE_URL="${DB_URL}" \
      API_PORT=4000 \
      CORS_ORIGIN="http://localhost:3000" \
      JWT_SECRET="replace-with-long-random-secret" \
      TSX_TSCONFIG_PATH="apps/api/tsconfig.json" \
      npx tsx apps/api/src/index.ts \
      >"${LOG_DIR}/api.log" 2>&1 &
    echo $! > "${api_pid_file}"
  )
}

start_web() {
  if [[ -f "${web_pid_file}" ]] && is_pid_running "$(cat "${web_pid_file}")"; then
    echo "Web already running."
    return
  fi

  (
    cd "${ROOT_DIR}"
    nohup env \
      NEXT_PUBLIC_API_URL="http://localhost:4000" \
      npm run dev -w @meteria/web \
      >"${LOG_DIR}/web.log" 2>&1 &
    echo $! > "${web_pid_file}"
  )
}

start_worker() {
  if [[ -f "${worker_pid_file}" ]] && is_pid_running "$(cat "${worker_pid_file}")"; then
    echo "Worker already running."
    return
  fi

  (
    cd "${ROOT_DIR}"
    nohup env \
      DATABASE_URL="${DB_URL}" \
      DIRECT_DATABASE_URL="${DB_URL}" \
      WORKER_INTERVAL_MS=30000 \
      TSX_TSCONFIG_PATH="apps/worker/tsconfig.json" \
      npx tsx apps/worker/src/index.ts \
      >"${LOG_DIR}/worker.log" 2>&1 &
    echo $! > "${worker_pid_file}"
  )
}

print_status() {
  echo "Meteria local status"
  echo "  DB container: ${DB_CONTAINER}"
  if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
    echo "    - running (port ${DB_PORT})"
  else
    echo "    - stopped"
  fi

  for svc in api web worker; do
    local pid_file="${PID_DIR}/${svc}.pid"
    if [[ -f "${pid_file}" ]] && is_pid_running "$(cat "${pid_file}")"; then
      echo "  ${svc}: running (pid $(cat "${pid_file}"))"
    else
      echo "  ${svc}: stopped"
    fi
  done

  echo "  Web URL: http://localhost:3000"
  echo "  API URL: http://localhost:4000"
}

show_logs() {
  local target="${1:-all}"
  case "${target}" in
    api) tail -n 120 "${LOG_DIR}/api.log" ;;
    web) tail -n 120 "${LOG_DIR}/web.log" ;;
    worker) tail -n 120 "${LOG_DIR}/worker.log" ;;
    all)
      echo "== API =="
      tail -n 80 "${LOG_DIR}/api.log" || true
      echo "== WEB =="
      tail -n 80 "${LOG_DIR}/web.log" || true
      echo "== WORKER =="
      tail -n 80 "${LOG_DIR}/worker.log" || true
      ;;
    *)
      echo "Unknown log target: ${target}"
      echo "Use: logs [api|web|worker|all]"
      exit 1
      ;;
  esac
}

case "${1:-}" in
  start)
    start_db
    prepare_db
    start_api
    start_web
    start_worker
    sleep 2
    print_status
    ;;
  stop)
    kill_from_pid_file "${api_pid_file}"
    kill_from_pid_file "${web_pid_file}"
    kill_from_pid_file "${worker_pid_file}"
    if docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
      docker stop "${DB_CONTAINER}" >/dev/null
    fi
    echo "Stopped Meteria local services."
    ;;
  status)
    print_status
    ;;
  logs)
    show_logs "${2:-all}"
    ;;
  *)
    cat <<EOF
Usage: infra/scripts/run-local.sh <command>

Commands:
  start    Start DB container, prepare DB, then start api/web/worker (dev mode)
  stop     Stop api/web/worker and DB container
  status   Print current local status
  logs     Show logs (optional target: api|web|worker|all)
EOF
    exit 1
    ;;
esac
