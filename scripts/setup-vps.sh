#!/bin/bash
# =============================================================================
# VPS Initial Setup Script
# Run this script on a fresh Ubuntu VPS to prepare for deployment
# =============================================================================
# Usage: 
#   PROJECT_NAME=my-project ./scripts/setup-vps.sh
#   or
#   ./scripts/setup-vps.sh  (will prompt for project name)
# =============================================================================

set -e

echo "==========================================="
echo "🚀 VPS Setup Script"
echo "==========================================="

# Get project name from environment or prompt
if [ -z "$PROJECT_NAME" ]; then
    # Try to get from git if in a repo
    if [ -d ".git" ]; then
        PROJECT_NAME=$(basename $(git rev-parse --show-toplevel 2>/dev/null) 2>/dev/null)
    fi
    
    if [ -z "$PROJECT_NAME" ]; then
        # Read from /dev/tty to work when script is piped from curl
        echo -n "Enter project name (e.g., my-project): "
        read PROJECT_NAME < /dev/tty
    fi
fi

# Sanitize project name for Docker (lowercase, alphanumeric and hyphens only)
PROJECT_NAME=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]-')

if [ -z "$PROJECT_NAME" ]; then
    echo "❌ Error: Project name is required"
    exit 1
fi

APP_DIR="/opt/$PROJECT_NAME"

echo ""
echo "📦 Project: $PROJECT_NAME"
echo "📁 App Directory: $APP_DIR"
echo ""

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install required packages
echo "📦 Installing required packages..."
apt install -y \
    curl \
    git \
    htop \
    ufw \
    fail2ban \
    unzip

# Install Docker
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    
    # Enable Docker service
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose (if not included)
echo "🐳 Checking Docker Compose..."
docker compose version || {
    echo "Installing Docker Compose..."
    apt install -y docker-compose-plugin
}

# Configure firewall
echo "🔒 Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3001/tcp
ufw --force enable

# Configure fail2ban
echo "🔒 Configuring fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban

# Create app directory with project-specific name
echo "📁 Creating app directory: $APP_DIR..."
mkdir -p "$APP_DIR"
mkdir -p "$APP_DIR/backups"
mkdir -p "$APP_DIR/nginx/ssl"

# Set permissions
chown -R root:root "$APP_DIR"

# Setup swap (if not exists)
echo "💾 Setting up swap..."
if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
fi

# Setup log rotation for Docker
echo "📝 Configuring Docker log rotation..."
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker

echo ""
echo "==========================================="
echo "✅ VPS Setup Complete!"
echo "==========================================="
echo ""
echo "Project: $PROJECT_NAME"
echo "App Directory: $APP_DIR"
echo ""
echo "Next steps:"
echo "1. Clone your repository to $APP_DIR"
echo "2. Create .env file in $APP_DIR"
echo "3. Add GitHub secrets to your repository:"
echo "   - VPS_HOST"
echo "   - VPS_USERNAME"
echo "   - VPS_SSH_KEY"
echo "   - GH_SECRET"
echo "4. Push to main branch to trigger deployment"
echo ""
