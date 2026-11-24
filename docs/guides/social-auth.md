# Social sign-in

Each provider appears **only if both** `<PROVIDER>_CLIENT_ID` and `<PROVIDER>_CLIENT_SECRET` are set. Print the redirect URIs to register with: `pnpm auth:redirect-uris https://your-domain`.

| Provider    | Status                          | Redirect URI                                     |
| ----------- | ------------------------------- | ------------------------------------------------ |
| Google      | ✅ documented + manually tested | `{APP_URL}/api/auth/callback/google`             |
| GitHub      | ✅ documented + manually tested | `{APP_URL}/api/auth/callback/github`             |
| Facebook    | ⚙️ config-ready, not E2E tested | `{APP_URL}/api/auth/callback/facebook`           |
| X (Twitter) | ⚙️ config-ready, not E2E tested | `{APP_URL}/api/auth/callback/twitter`            |
| Apple       | ⚙️ config-ready, not E2E tested | `{APP_URL}/api/auth/callback/apple` (HTTPS only) |

Create **separate** OAuth apps for local development and production — never reuse a production secret locally.

## Google

1. Google Cloud Console → _APIs & Services_ → **OAuth consent screen** (External; add yourself as a test user while in "Testing").
2. _Credentials_ → **Create credentials → OAuth client ID** → _Web application_.
3. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` (+ production).
4. Copy the client ID/secret into `.env.local`. Scopes used: `openid email profile`. Google reports whether the email is verified.

## GitHub

1. GitHub → _Settings → Developer settings → OAuth Apps → New OAuth App_.
2. Homepage URL = your app URL; **Authorization callback URL** = `http://localhost:3000/api/auth/callback/github`.
3. Generate a client secret; copy both values. Users who keep their email private still work: the app reads their **primary verified** email (scope `user:email`).

## Facebook

Meta for Developers → _Create app_ → add **Facebook Login** → _Valid OAuth Redirect URIs_. `email` and `public_profile` need no review, but the app must be **Live** for people who aren't app testers. Facebook accounts may have **no email**.

## X (Twitter)

Developer portal → app → _User authentication settings_ → **OAuth 2.0**, type _Web App_, set the callback URL. Getting the user's **email** requires enabling "Request email from users" (may need elevated access).

## Apple

Needs a paid Apple Developer account. Create an **App ID**, a **Services ID** (this is the `CLIENT_ID`) with _Sign in with Apple_ enabled, a **Key** (.p8), and register your **HTTPS** domain + return URL (`localhost` is not allowed — test on a deployed preview). The client secret is a **JWT that expires in ≤ 6 months**: generate it with `pnpm apple:secret` and put a reminder in your calendar. Apple may return a **private relay** address (`…@privaterelay.appleid.com`) and only sends the name on the first sign-in.

## Manual acceptance checklist (Google and GitHub)

- [ ] New user signs in → account created, `user.email_verified = true`, name and image filled
- [ ] Signing out and in again reuses the same account (no duplicate user)
- [ ] User with a password account (same verified email) signs in with the provider → accounts are **linked**, not duplicated
- [ ] Cancelling at the provider returns to `/sign-in` with a readable error
- [ ] Security → _Connected accounts_: connect and disconnect work; the **last** sign-in method can't be disconnected
- [ ] Production redirect URI registered and tested on the deployed URL
