#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATABASE_URL="$ROOT/data/agent-world.db"
export AGENT_WORLD_CONFIGS_DIR="$ROOT/configs"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  kill $SERVER_PID 2>/dev/null
  kill $WEB_PID 2>/dev/null
  wait $SERVER_PID 2>/dev/null
  wait $WEB_PID 2>/dev/null
  echo -e "${GREEN}Done.${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

echo -e "${YELLOW}=== Agent World Startup ===${NC}"
echo "Root: $ROOT"
echo ""

# ── 1. Install dependencies ──
echo -e "${YELLOW}[1/4] Installing dependencies...${NC}"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
echo -e "${GREEN}  Dependencies OK${NC}"

# ── 2. Database setup ──
echo -e "${YELLOW}[2/4] Setting up database...${NC}"
mkdir -p data
pnpm exec tsx packages/db/src/migrate.ts
echo -e "${GREEN}  Database OK${NC}"

# ── 3. Seed ──
echo -e "${YELLOW}[3/4] Seeding world...${NC}"
pnpm exec tsx scripts/seed.ts
echo -e "${GREEN}  Seed OK${NC}"

# ── 4. Start services ──
echo -e "${YELLOW}[4/4] Starting services...${NC}"

# Start Fastify server
echo -e "  Starting API server..."
pnpm --filter @agw/server dev &
SERVER_PID=$!

# Wait for server to be ready
echo -n "  Waiting for server"
for i in $(seq 1 30); do
  if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo ""
    echo -e "  ${GREEN}API server ready on http://localhost:3001${NC}"
    break
  fi
  echo -n "."
  sleep 0.5
done

# Start Next.js frontend
echo -e "  Starting frontend..."
npx next dev -p 3000 &
WEB_PID=$!

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Agent World is starting up!${NC}"
echo -e "${GREEN}  Frontend : http://localhost:3000${NC}"
echo -e "${GREEN}  API      : http://localhost:3001${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Press Ctrl+C to stop all services."

wait
