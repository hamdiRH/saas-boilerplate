// scripts/verify-build-assets.mjs
// Usage: start the production server in another tab (pnpm start), then run this.
const base = process.env.BASE_URL ?? "http://localhost:3000";

const response = await fetch(base);
const html = await response.text();
const chunk = html.match(/\/_next\/static\/[^"']+\.js/u)?.[0];

console.log("HTML length:", html.length, "(compact, no pretty-printing)");
console.log("First 200 chars:", html.slice(0, 200).replaceAll(/\s+/gu, " "));

if (!chunk) {
  console.error("❌ No static JS chunk found in HTML");
  process.exit(1);
}

const res = await fetch(base + chunk, { method: "HEAD" });
console.log("Asset:", chunk);
console.log("Cache-Control:", res.headers.get("cache-control"));
console.log(
  /immutable/u.test(res.headers.get("cache-control") ?? "")
    ? "✅ hashed + immutable (cache busting works)"
    : "❌ expected an immutable Cache-Control"
);
