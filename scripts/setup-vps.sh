#!/bin/bash
# =============================================================================
# VPS Initial Setup Script
# Run this script on a fresh Ubuntu VPS to prepare for deployment
# =============================================================================

set -e

echo "==========================================="
echo "🚀 VPS Setup Script"
echo "==========================================="

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

# Create app directory
echo "📁 Creating app directory..."
mkdir -p /opt/app
mkdir -p /opt/app/backups
mkdir -p /opt/app/nginx/ssl

# Set permissions
chown -R root:root /opt/app

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
echo "Next steps:"
echo "1. Clone your repository to /opt/app"
echo "2. Create .env.production file"
echo "3. Add GitHub secrets to your repository"
echo "4. Push to main branch to trigger deployment"
echo ""
