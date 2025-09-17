#!/usr/bin/env bun

import { serve } from "bun";
import { parseArgs } from "util";
import os from "node:os";

// 获取内网 IP（优先 IPv4、非 127.0.0.1）
function getLocalIP() {
	for (const iface of Object.values(os.networkInterfaces())) {
		if (!iface) continue;
		for (const addr of iface) {
			if (addr.family === "IPv4" && !addr.internal) {
				return addr.address;
			}
		}
	}
	return "127.0.0.1";
}

// 异步获取公网 IP（调用外部服务）
async function getPublicIP() {
	try {
		const res = await fetch("https://api.ipify.org?format=json");
		const { ip } = await res.json();
		return ip;
	} catch {
		return "unknown";
	}
}

const {
	values: { ports },
} = parseArgs({
	options: {
		ports: { type: "string", short: "p" },
	},
});

if (!ports) {
	console.error(
		"Please provide a port for the proxy and upstream, like: -p 4900:4000",
	);
	process.exit(1);
}

const [PROXY_PORT, UPSTREAM_PORT] = ports.split(":");

if (!PROXY_PORT || !UPSTREAM_PORT) {
	console.error(
		"Please provide a port for the proxy and upstream, like: -p 4900:4000",
	);
	process.exit(1);
}

const UPSTREAM_HTTP = `http://127.0.0.1:${UPSTREAM_PORT}`;
const UPSTREAM_WS = `ws://127.0.0.1:${UPSTREAM_PORT}`;

let upstream: WebSocket | null = null;
let clientClosed = false;

serve({
	port: PROXY_PORT,

	async fetch(req, server) {
		const url = new URL(req.url);
		// 如果是 WS 的 Upgrade 请求，把原始路径挂到 ws.data
		if (server.upgrade(req, { data: { path: url.pathname + url.search } })) {
			return;
		}
		// 普通 HTTP 透传
		return fetch(UPSTREAM_HTTP + url.pathname + url.search, {
			method: req.method,
			headers: req.headers,
			body: req.body,
		});
	},

	websocket: {
		open(ws: any) {
			const path = ws.data.path as string;
			console.log("🕸 New WS proxy for", path);

			// 1. 客户端 → 上游，只注册一次
			ws.subscribe("message", (msg: any) => {
				if (upstream && upstream.readyState === WebSocket.OPEN) {
					upstream.send(msg);
				}
			});

			// 2. 客户端断开，停止重连并关掉上游
			ws.subscribe("close", () => {
				clientClosed = true;
				if (upstream) upstream.close();
			});

			// 3. 负责尝试连接上游，并在断开或失败时 2 秒后重试
			async function connectUpstream() {
				if (clientClosed) return;

				try {
					const u = new WebSocket(UPSTREAM_WS + path, {
						protocols: ["vite-hmr"], // 请求 HMR 协议，才能拿到 update
					});
					upstream = u;

					// 等待 open 或 error
					await new Promise((resolve, reject) => {
						u.addEventListener("open", resolve);
						u.addEventListener("error", reject);
					});
					console.log("   ↔️ Upstream WS open");

					// 上游 → 客户端
					u.addEventListener("message", (evt) => {
						ws.send(evt.data);
					});

					// 上游断开，2s 后重试
					u.addEventListener("close", () => {
						if (!clientClosed) {
							console.warn("   ↔️ Upstream closed, retrying in 2s");
							setTimeout(connectUpstream, 2000);
						}
					});

					// 上游错误，2s 后重试
					u.addEventListener("error", (err) => {
						console.error("   ⚠️ Upstream WS error:", err);
						if (!clientClosed) {
							console.warn("   ↔️ Retrying in 2s");
							setTimeout(connectUpstream, 2000);
						}
					});
				} catch (err) {
					console.error("   ❌ Failed to connect upstream:", err);
					if (!clientClosed) {
						console.warn("   ↔️ Retrying in 2s");
						setTimeout(connectUpstream, 2000);
					}
				}
			}

			// 启动第一次连接
			connectUpstream();
		},
		message: (ws, message) => {
			console.log("Client sent message", message);
		},
		close: (ws) => {
			console.log("Client disconnected");
		},
	},
});

(async () => {
	const localIP = getLocalIP();
	const publicIP = await getPublicIP();
	console.log(`📡 Local IP:   http://${localIP}:${PROXY_PORT}`);
	console.log(`🌍 Public IP:  http://${publicIP}:${PROXY_PORT}`);
})();