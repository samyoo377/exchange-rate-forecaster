#!/usr/bin/env bash
set -e

echo "🚀 Starting exchange-rate-forecaster..."

# Install deps if needed
if [ ! -d "server/node_modules" ]; then
  echo "📦 Installing server dependencies..."
  pnpm --filter exchange-rate-server install
fi

if [ ! -d "web/node_modules" ]; then
  echo "📦 Installing web dependencies..."
  pnpm --filter exchange-rate-web install
fi

# Push DB schema
echo "🗄  Initializing database..."
pnpm db:push

# Start server in background
echo "⚙️  Starting backend (port 3001)..."
pnpm dev:server &
SERVER_PID=$!

# Give server a moment to boot
sleep 2

# Auto-import Excel data if DB is empty
echo "📊 Importing default Excel data..."
curl -s -X POST http://localhost:3001/api/v1/files/import \
  -H "Content-Type: application/json" \
  -d "{\"filePath\":\"USDCNH-BBG-20Days.xlsx\",\"symbol\":\"USDCNH\"}" | cat

echo ""
echo "🌐 Starting frontend (port 5173)..."
pnpm dev:web &
WEB_PID=$!

echo ""
echo "✅ Services started:"
echo "   Backend:  http://localhost:3001"
echo "   Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop all services."

wait $SERVER_PID $WEB_PID
