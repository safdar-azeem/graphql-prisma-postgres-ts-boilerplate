#!/bin/bash
# ==============================================================================
# Initialize multiple PostgreSQL databases for sharding
# This script runs automatically on first container startup
# ==============================================================================

set -e
set -u

create_database() {
    local database=$1
    echo "  Creating database '$database'..."
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
        SELECT 'CREATE DATABASE "$database"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$database')\gexec
EOSQL
}

echo "========================================"
echo "Initializing shard databases..."
echo "========================================"

# Create shard databases
for db in shard1 shard2 shard3; do
    create_database "$db"
done

echo "========================================"
echo "Database initialization complete!"
echo "Created databases: test, shard1, shard2, shard3"
echo "========================================"
