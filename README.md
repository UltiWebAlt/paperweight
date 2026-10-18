# Paperweight 🗿

**Your inbox knows where your data lives. We help you take back control.**

<img src="website/public/dashboard.png" alt="Dashboard" width="600" />

Every account you create, every service you sign up for, every online purchase is connected to your email address. Most people have 100+ accounts they've forgotten about, creating security risks and privacy exposure.

Paperweight scans your inbox to map your digital footprint, then helps you take back control and delete your data.

Local-first. Your data stays on your computer. Respecting your privacy by default.

## Features

- **Marketing/Bulk unsubscribe** — Find an unsubscribe from marketing and bulk mailing lists in minutes
- **Account inventory** — Discover which vendors and services have your data
- **Breach alerts** — Know when companies you use get breached (via haveibeenpwned.com)
- **GDPR deletion support** — Generate data deletion requests to reduce exposure
- **Local-first** — Your emails and settings stay on your machine
- **Privacy-respecting** — No data sent to external servers
- **Open development** — Built in public, source code available for audit

## Email Providers

- ✅ Custom IMAP
- ✅ Google / Gmail
- ✅ Microsoft
- ✅ Apple
- ✅ Proton Mail (via Bridge)

IMAP Presets: Proton, Yahoo Mail, Fastmail, Yandex, Zoho, Mailbox.org, Posteo, GMX.

## Quick Start

1. Download [latest release](https://github.com/wslyvh/paperweight/releases) for your platform
2. Connect your email
3. Scan your inbox in ~2 minutes
4. Start unsubscribing and deleting

For Gmail, **Settings → Sync → Folders to include** lets you include Spam and
Trash independently. Both are off by default. **Apply and sync** restarts the
history scan with your selection; previously imported emails remain in Paperweight.

Connect additional accounts through **Settings → Accounts → Add account**.
Multi-account support is enabled by default; no license or `.env` changes are needed.
The `.env` OAuth client credentials identify the application, not individual email accounts.

## License

Core features and multiple email accounts are available for free. Purchasing a license supports open-source software development.

- **Free tier**: Full email history, multiple email accounts, core features included
- **Perpetual license**: All features, unlimited email history, multiple email accounts, permanent use of Paperweight

[Buy a perpetual license and support development →](https://www.paperweight.email/#pricing)

## Development

If you're building from source you need to add your own OAuth credentials. Copy [`.env.example`](.env.example) as `.env` and add your own Google and Microsoft client info.

Values in the project-root `.env` override shell/IDE environment variables. Restart `yarn dev` after editing it; packaged builds need to be rebuilt to use updated OAuth credentials.

**Google** - https://console.cloud.google.com/
- Create OAuth 2.0 credentials, application type "Desktop app"
- Enable the **Gmail API** in API Library
- Add scope `https://www.googleapis.com/auth/gmail.modify` on the consent screen
- Add yourself as a test user while the app is in testing mode
- Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

**Microsoft** - https://portal.azure.com/
- Register an app, supported account types "Personal + work/school"
- Authentication → add "Mobile and desktop applications" platform with redirect URI `http://localhost`
- API permissions → Microsoft Graph → Delegated → add `User.Read`, `Mail.ReadWrite`, `Mail.Send`, `offline_access`, `openid`, `profile`
- Set `MICROSOFT_CLIENT_ID` (no secret — we use PKCE)

## SonarQube

Paperweight is configured for the local SonarQube server at
`http://localhost:9000`, with project key `paperweight`.
The official SonarScanner is included as a development dependency; no global
installation is needed. Install dependencies with `yarn install`, set
`SONAR_TOKEN` in your environment, then run:

```sh
yarn test:coverage
yarn sonar
```

Open the [Paperweight dashboard](http://localhost:9000/dashboard?id=paperweight)
after processing completes. Set `SONAR_HOST_URL` to scan against another server.
The scan includes the app, analysis engine, scripts, and website. Coverage is
imported from both the app's Jest suite and the analysis engine's Vitest suite.
Untested production files remain visible in the coverage figures.

## Contributing

Feedback, bug reports, and PRs are welcome.

**Language lexicons** — Paperweight's analysis engine classifies mail
(purchases, updates, promotions) and finds unsubscribe links using
per-language phrase lexicons. English and Dutch are curated; other languages
need native speakers. Adding or improving a language is a single-file data
contribution — no engine knowledge required. See
[`analysis/src/data/lexicons/README.md`](analysis/src/data/lexicons/README.md)
for the rules.

### Building for Arch Linux / Manjaro

Run `yarn dist:archlinux` on Linux to build a native pacman package for the host
architecture. The package is written to `dist/paperweight-<version>-<arch>.pkg.tar.xz`.
Install it with `sudo pacman -U ./dist/paperweight-<version>-<arch>.pkg.tar.xz`,
replacing the placeholders with the generated filename.

### Gmail request pacing

All Gmail REST calls (sync, profile lookup, trash/spam/read actions, and sending)
use the mandatory gate in `src/main/providers/gmail-request.ts`. The app starts
at one request per second across all accounts and workers. Quota errors slow
that pace and persist a shared cooldown in `global.db`, honoring `Retry-After`.
Restarting sync, switching accounts, or restarting the app does not reset it.
This conservative shared budget can make large bulk actions take longer.

Reads and idempotent label/trash actions have bounded backoff retries. Sending
mail is paced but never automatically replayed. Failed bulk actions stop and
retain local records so uncompleted operations are not reported as deleted.
Provider routing and persistence tests run in the normal CI test suite.
