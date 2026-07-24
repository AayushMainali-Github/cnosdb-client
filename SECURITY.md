# Security Policy

## Supported versions

| Version | Supported                   |
| ------- | --------------------------- |
| 0.1.x   | Yes — current release line  |
| < 0.1   | No — no such release exists |

Before 1.0, security fixes are released on the latest minor line only. Upgrade
to the newest 0.x release to stay supported.

## Reporting a vulnerability

**Please do not open a public issue, discussion, or pull request for a
vulnerability, and please do not post a working exploit publicly.**

Report privately through GitHub's private vulnerability reporting:

1. Go to <https://github.com/AayushMainali-Github/cnosdb-client/security/advisories/new>.
2. Describe the issue and how to reproduce it.
3. Submit the draft advisory.

This creates a private channel visible only to maintainers. If private
reporting is unavailable to you, open a public issue that says only that you
have a security report and asks a maintainer to contact you — include no
technical detail.

### What to include

The more of this you can provide, the faster the fix:

- affected `cnosdb-client` version;
- Node.js version and operating system;
- CnosDB version, if relevant;
- a minimal reproduction;
- the impact you believe it has, and any assumed preconditions;
- any suggested remediation.

Remove real credentials, tokens, hostnames, and customer data before sending
anything.

## What happens next

These are goals, not contractual guarantees, from a small volunteer project:

| Stage                  | Target                  |
| ---------------------- | ----------------------- |
| Acknowledge the report | within 5 business days  |
| Initial assessment     | within 10 business days |
| Fix or mitigation plan | depends on severity     |

We follow coordinated disclosure. We will work with you on a fix, keep you
informed, publish a GitHub Security Advisory with a CVE where appropriate, and
credit you unless you prefer otherwise. Please give us a reasonable opportunity
to release a fix before publishing details; 90 days is a normal upper bound.

## Dependency vulnerabilities

This package has zero runtime dependencies, so a vulnerability in a development
dependency does not reach your production install. Dependabot alerts and
dependency review run on this repository, and development dependency advisories
are handled as ordinary maintenance unless they affect the published artifact
or the release pipeline, in which case they are treated as security work.

## How this package handles your secrets

Security-relevant behaviour is intentional and covered by tests:

- The password and the `Authorization` header are never placed in an error message, an error property, or a URL.
- Errors carry only the HTTP status, method, request path, and a truncated response body.
- The client never logs.
- Credentials embedded in the configured `url` are rejected outright.
- Error response bodies are truncated to 64 KiB, so a hostile server cannot force unbounded memory use.
- Requests are always bounded by a timeout, and nothing is retried automatically.

Note that the client sends raw SQL and performs no parameterization or
sanitization. Never build a statement from untrusted input.
