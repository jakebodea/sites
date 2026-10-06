// Deployed by Alchemy (alchemy.run.ts): no `adapter` here — Alchemy injects its own Cloudflare adapter.
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import icon from "astro-iconset";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	output: "server",
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	vite: {
		resolve: {
			alias: [
				// Alchemy pins the Worker entry; point it at EmDash's entry (adds scheduled + PluginBridge).
				{ find: /^@alchemy\.run\/frontend-frameworks\/astro\/entrypoints\/server$/, replacement: new URL("./src/worker.ts", import.meta.url).pathname },
				// EmDash's entry wraps the stock adapter handler; hand it Alchemy's vendored copy instead.
				{ find: /^@astrojs\/cloudflare\/entrypoints\/server$/, replacement: "@alchemy.run/frontend-frameworks/astro/entrypoints/server.js" },
				// Alchemy installs a passthrough /_image endpoint, which EmDash won't wrap; use EmDash's
				// Cloudflare endpoint instead (reads media from R2, resizes with the IMAGES binding).
				{ find: /^.*\/image-passthrough-endpoint\.js$/, replacement: "@emdash-cms/cloudflare/image-endpoint" },
			],
		},
		ssr: {
			optimizeDeps: {
				// Pre-bundle so it isn't discovered mid-render, which would trigger
				// a Vite dep re-optimization and break in-flight worker imports
				// under the Cloudflare dev runner (workerd).
				include: ["astro-iconset/components"],
			},
		},
	},
	integrations: [
		react(),
		icon({
			// Only ship the Phosphor icons actually referenced in templates,
			// not the full @iconify-json/ph set (which adds megabytes to the
			// deployed worker bundle).
			include: {
				ph: [
					"chart-bar",
					"check-circle",
					"clock",
					"cloud",
					"code",
					"currency-dollar",
					"envelope",
					"globe",
					"heart",
					"lifebuoy",
					"lightning",
					"lock",
					"shield-check",
					"sparkle",
					"star",
					"users-three",
				],
			},
		}),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700, 800],
			fallbacks: ["sans-serif"],
		},
	],
	devToolbar: { enabled: false },
});
