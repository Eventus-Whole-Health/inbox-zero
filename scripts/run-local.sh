#!/bin/bash
# Run local Docker container (uses production PostgreSQL and Redis)
#
# This connects to production data so your rules, settings, and
# user data are always in sync with production.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "========================================"
echo "  Inbox Zero - Local Development"
echo "========================================"
echo ""

# Check public IP
echo "Your public IP:"
curl -4 -s ifconfig.me 2>/dev/null || curl -s ipv4.icanhazip.com
echo ""
echo ""

# Test PostgreSQL connectivity
echo "Testing PostgreSQL connection..."
if command -v psql &> /dev/null; then
    PGPASSWORD="zDcVThluvziPLtuzuJJfQWt1" psql \
        -h keystone-platform-postgres.postgres.database.azure.com \
        -U dify_admin \
        -d inboxzero \
        -c "SELECT 1" > /dev/null 2>&1 && echo "✅ PostgreSQL OK" || {
            echo "❌ PostgreSQL connection failed"
            echo ""
            echo "Your IP may not be in the firewall. Add it with:"
            echo ""
            echo "  az postgres flexible-server firewall-rule create \\"
            echo "    --resource-group rg-keystone-platform \\"
            echo "    --name keystone-platform-postgres \\"
            echo "    --rule-name allow-local-dev \\"
            echo "    --start-ip-address \$(curl -4 -s ifconfig.me) \\"
            echo "    --end-ip-address \$(curl -4 -s ifconfig.me)"
            echo ""
            exit 1
        }
else
    echo "⚠️  psql not installed, skipping connection test"
fi

# Test Redis
echo "Testing Redis proxy..."
REDIS_TEST=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer 496edcb8b2f4cfedc10e4b7c4b456403ed9f3ea29b0bfea620b63bf5df1edb19" \
    "https://inbox-zero-redis-proxy.azurewebsites.net/" 2>/dev/null)
if [ "$REDIS_TEST" = "200" ] || [ "$REDIS_TEST" = "401" ]; then
    echo "✅ Redis proxy OK"
else
    echo "⚠️  Redis proxy returned $REDIS_TEST"
fi

echo ""
echo "Starting container (uses production data)..."
echo ""

# Stop any existing containers
docker compose down 2>/dev/null || true

# Run web service only (no local db/redis)
docker compose up web "$@"
