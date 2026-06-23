# Security Policy

## Firebase API Key

`js/firebase-config.js` contains a Firebase API key. This is **intentional and safe** — Firebase client-side API keys are designed to be public. They identify the project but do not grant privileged access. Access is controlled by [Firebase Security Rules](https://firebase.google.com/docs/rules) configured in the Firebase console, not by keeping the key secret.

Do not move this key to a GitHub secret or environment variable. It must be present in the browser bundle for the app to work.

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not open a public GitHub issue**.

Instead, email: **atharva.shukla2367@gmail.com**

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

You can expect a response within 72 hours.
