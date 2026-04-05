# Test script for MCP Project Hub Server

$ErrorActionPreference = "Stop"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "MCP Project Hub Server Test" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check if .env exists
if (-not (Test-Path .env)) {
    Write-Host "⚠️  .env file not found. Copying from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "⚠️  Please edit .env with your actual configuration" -ForegroundColor Yellow
    exit 1
}

# Install dependencies if needed
if (-not (Test-Path node_modules)) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
    npm install
}

# Build the project
Write-Host "🔨 Building project..." -ForegroundColor Cyan
npm run build

# Run tests
Write-Host "🧪 Running tests..." -ForegroundColor Cyan
npm test

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ All tests passed!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To start the server:" -ForegroundColor Cyan
Write-Host "  npm start" -ForegroundColor White
Write-Host ""
Write-Host "To start in development mode:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White
