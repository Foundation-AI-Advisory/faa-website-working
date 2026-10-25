# FAA contact form rollout

Status: prepared, disabled. No deployment or real delivery has been verified.

The marketing repository has GitHub Pages enabled. Static hosting cannot run the Resend handler. Deploy this directory as a separate Node.js serverless project (the adapter is provided for Vercel); do not move the website or its DNS. Confirm the organization's existing hosting account and plan before provisioning anything or incurring charges.

## Secrets and spam protection
Store RESEND_API_KEY (sending-only, scoped to foundationaiadvisory.com) and TURNSTILE_SECRET_KEY in the backend host's encrypted environment settings. Never put secrets in GitHub or contact-config.json. Set up a Turnstile widget for foundationaiadvisory.com and www.foundationaiadvisory.com, action contact. Add host-level rate limits before public launch. CORS alone is not abuse prevention. The handler validates the challenge on the server and fails closed if configuration is missing.

## Deploy and test
1. Run npm test in this directory. Tests use mocked upstream responses; they are not delivery evidence.
2. Deploy services/contact as the project root. The route is /api/contact. Check commercial hosting eligibility/cost before creating an account or plan.
3. Put the deployed HTTPS endpoint and public Turnstile site key in contact-config.json. Leave enabled false until a controlled production-origin test is ready.
4. On a controlled test page or during a supervised rollout, enable the form and submit a clearly labeled test inquiry. Verify Resend records delivery and verify the actual message in blueprint@foundationaiadvisory.com. Check Reply-To, desktop/mobile layout, keyboard navigation, invalid email, expired challenge, provider failure, and preserved input on retry.
5. Only after these checks, merge and activate contact-config.json enabled true. nav.js routes eligible inquiry email links to the contact form; explicitly visible email addresses and subscription requests remain email links.
6. Verify main-branch deployment and contact links on the live site. Confirm the current privacy policy covers contact processing through Resend and spam checks through Cloudflare before activation. No marketing opt-in is implied by a contact submission.

## Rollback and operational notes
Set enabled false to restore email contact links and hide the form; the contact page retains a direct email fallback. A successful handler response means Resend accepted the email, not proof of inbox receipt. Monitor Resend bounces/failures and assign Ben or a named backup to monitor the inbox. No personal data or secrets are written to application logs. Resend email content retention is governed by the account settings. Provider idempotency protects repeat attempts with the same submission ID; changing a field creates a new submission.

## Implementation
The form collects name, work email, company, and optional message. Notification recipient and sender are server-controlled; visitor email is Reply-To only. Plain-text notification avoids HTML injection. Request size and field limits, origin checks, honeypot, server-verified single-use Turnstile tokens, upstream timeouts, and generic failure responses are included. The subscription workflow is outside this change.
