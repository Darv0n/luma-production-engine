# DEPLOYMENT

## Option 1: Claude.ai Artifact (Current)

The monolith `luma-engine-v2.jsx` runs directly as a React artifact in Claude.ai.
No build step. No deployment. Copy-paste into an artifact and it works.

The Anthropic API calls are authenticated automatically within the Claude.ai
artifact environment — no API key needed.

## Option 2: Standalone Vite React App

```bash
# Create project
npm create vite@latest luma-engine -- --template react
cd luma-engine

# Copy source
cp -r src/components src/lib src/prompts src/styles src/

# Install dependencies (none beyond React — the app uses no external UI libs)
npm install

# Set up API proxy or key
# The app calls https://api.anthropic.com/v1/messages directly.
# In production, proxy through your backend to protect the API key.

npm run dev
```

### API Key Handling

**In Claude.ai artifacts**: API key is injected automatically. No configuration needed.

**Standalone**: You must either:
1. Proxy API calls through your backend (recommended)
2. Use environment variables with a server-side relay

**NEVER expose the Anthropic API key in client-side code.**

To add a proxy, modify `src/lib/api.js`:
```javascript
// Change this:
const API_URL = "https://api.anthropic.com/v1/messages";

// To this:
const API_URL = "/api/generate"; // Your backend proxy endpoint
```

## Option 3: Next.js with API Routes

```bash
npx create-next-app@latest luma-engine
cd luma-engine

# Copy source into app/
# Create app/api/generate/route.js as the API proxy
# The proxy adds the API key server-side
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (standalone) | Your Anthropic API key |
| `VITE_API_URL` | No | Override API endpoint URL |

## Tech Requirements

- React 18+
- Modern browser (ES2020+)
- Network access to api.anthropic.com (or your proxy)
- No other dependencies
