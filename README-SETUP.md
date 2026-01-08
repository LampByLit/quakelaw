# Quick Start Guide

## First Time Setup

1. **Create `.env` file** in the project root:
   ```
   DEEPSEEK_API_KEY=sk-77bd2e4c2d5d4c4d919d0bae808807e6
   DEEPSEEK_MODEL=deepseek-chat
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the server**:
   ```bash
   npm start
   ```
   Or on Windows, just double-click `start.bat`

4. **Open your browser** to:
   ```
   http://localhost:3000
   ```

## Railway Deployment

Set these environment variables in Railway:
- **Name:** `DEEPSEEK_API_KEY`
  **Value:** `sk-77bd2e4c2d5d4c4d919d0bae808807e6`
- **Name:** `DEEPSEEK_MODEL`
  **Value:** `deepseek-chat`

The server will automatically use the PORT environment variable that Railway provides.

