// Usage: pnpm auth:redirect-uris [https://your-production-domain.com]
const PROVIDERS = ['google', 'github', 'facebook', 'twitter', 'apple'];
const urls = ['http://localhost:3000', process.argv[2]].filter(Boolean);

for (const base of urls) {
  console.log(`\n# ${base}`);
  for (const id of PROVIDERS) {
    console.log(`${id.padEnd(9)} ${base.replace(/\/$/u, '')}/api/auth/callback/${id}`);
  }
}
