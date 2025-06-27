# bun-proxy-vite

Zero-dependency HTTP & WebSocket proxy for Bun/Vite HMR, perfect for WSL development contexts.

## Purpose

This tool provides a lightweight, zero-dependency proxy for HTTP requests and HMR (Hot Module Replacement) WebSocket connections when developing with Bun and Vite. It forwards browser traffic to an upstream server and handles automatic reconnections for WebSocket.

**Key scenario**: When running your Vite dev server inside WSL, this proxy makes it easy for Windows and other devices on your network to connect to the Vite service in WSL without extra firewall or network configuration.

## Features

- **Zero external dependencies**: only uses Bun’s built-in `serve`
- **HTTP proxy**: transparently forwards all HTTP requests
- **WebSocket support**: upgrades WebSocket connections (e.g., Vite HMR), relays messages, and auto-reconnects on disconnect
- **Customizable ports**: specify proxy and upstream ports via `-p` flag (format: `proxy:upstream`)

## Usage

Run directly with Bun (no installation required):

```bash
# Custom ports, e.g., proxy 6000 → upstream 5000
bunx bun-proxy-vite -p 6000:5000
```

## CLI Options

- `-p, --ports <proxy:upstream>`
  Set proxy and upstream ports. Format: `proxyPort:upstreamPort`. Example `-p 6000:5000`.

## How It Works

1. **HTTP requests**: All HTTP traffic on the proxy port is forwarded to the upstream server.
2. **WebSocket**: The proxy detects WebSocket upgrade requests, attaches the request path to the connection context, and establishes a WebSocket to the upstream HMR server. Messages are relayed both ways. If the upstream connection closes or errors out, it retries every 2 seconds until the client disconnects.

## Intent

When developing modern web applications with Bun and Vite — especially inside WSL or other isolated environments — you often need a simple proxy to handle both HTTP and HMR WebSocket traffic. This tool aims to provide a minimal, dependency-free solution that you can run with a single Bun command to bridge between WSL and your host network.

## License

MIT
