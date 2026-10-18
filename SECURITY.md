# Security Policy

## Supported versions

Security fixes are made on the latest release and `main`.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately via
[GitHub private vulnerability reporting](../../security/advisories/new) with:

- a description and impact,
- steps to reproduce (a minimal proof of concept if possible),
- affected version / commit.

You should receive an acknowledgement within 72 hours. We will agree on a disclosure timeline with you and credit you
in the release notes unless you prefer otherwise.

## Scope highlights

Authorization between users/workspaces, session handling, the SSRF guard for LLM base URLs, task-package import
validation, file uploads, and the coding-agent adapter's isolation are all in scope.

The security design is documented in [docs/SECURITY.md](docs/SECURITY.md).
