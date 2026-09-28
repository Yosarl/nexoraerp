# Project Rules

## 1. Change Impact Verification
- When making changes to any file, carefully verify if and how it affects any feature or workflow of the application before concluding.

## 2. Browser Checking & Testing Restriction
- **Do NOT check the web application through the browser or launch the browser subagent (`browser_subagent`) unless the user explicitly suggests, asks, or instructs to check via the browser.**
- Verification should rely on code analysis, type checking, or unit/integration tests unless browser verification is specifically requested by the user.
