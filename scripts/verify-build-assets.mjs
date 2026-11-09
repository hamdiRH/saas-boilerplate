// scripts/verify-build-assets.mjs
// Usage: start the production server in another tab (pnpm start), then run this.
const base = process.env.BASE_URL ?? "http://localhost:3000";

const html = await (await fetch(base)).text();
const chunk = html.match(/\/_next\/static\/[^"']+\.js/)?.[0];

console.log("HTML length:", html.length, "(compact, no pretty-printing)");
console.log("First 200 chars:", html.slice(0, 200).replace(/\s+/g, " "));

if (!chunk) {
  console.error("❌ No static JS chunk found in HTML");
  process.exit(1);
}

const res = await fetch(base + chunk, { method: "HEAD" });
console.log("Asset:", chunk);
console.log("Cache-Control:", res.headers.get("cache-control"));
console.log(
  /immutable/.test(res.headers.get("cache-control") ?? "")
    ? "✅ hashed + immutable (cache busting works)"
    : "❌ expected an immutable Cache-Control",
);
