# Security Policy

## Threat Model Notes

- Data at rest is encrypted in browser storage.
- The app includes client-side hardening (sanitized rich text + strict security headers) to reduce script-injection risk.
- A fully compromised device/browser profile can still bypass client-side controls. No pure browser app can guarantee protection against privileged malware.

## Reporting a Vulnerability

If you discover a security issue, please do not open a public issue first.

1. Open a private security advisory in GitHub, or
2. Contact the maintainers directly

Please include:

- Description of the issue
- Steps to reproduce
- Potential impact
- Suggested remediation (if known)

Reports will be acknowledged as soon as possible and worked on promptly.

## Supported Versions

Only the latest `main` branch is currently supported with security fixes.
