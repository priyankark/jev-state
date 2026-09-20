# Security

Do not post API keys, access tokens, or private transcripts in issues. Report
security issues through GitHub's private vulnerability reporting when available.

Hosted authentication uses Supabase Auth. Application data is private per account;
database tables and RPC functions deny anonymous and authenticated database roles.
The server verifies the session and supplies the user ID to every operation.
Provider credentials are encrypted with AES-256-GCM and bound to their account and
provider. Keep the encryption key separate from database backups.

Dodo webhook signatures are verified against the exact raw request body. Only
the configured product can grant paid access. Checkout redirects never grant
entitlements. Duplicate and stale events are handled in an atomic database function.

Rotate compromised provider keys in the provider dashboard, replace the stored
connection, and revoke affected sessions. Changing CREDENTIAL_ENCRYPTION_KEY
requires re-encrypting existing rows or asking customers to reconnect providers.
