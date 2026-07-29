# Instructions for AI Agents

- **Single source of truth:** Never duplicate state; maintain one authoritative data store with read-only UI projections.
- **Zero ambiguity:** Explicitly justify logic decisions and clarify ambiguous requirements instead of guessing.
- **Minimalist codebase:** Avoid speculative abstractions, replace magic values with named constants, and delete unused code entirely.
- **Separation of concerns:** Strictly isolate state transitions, UI rendering, and side effects; route asynchronous operations back through an explicit update loop.
- **Functional & deterministic design:** Prefer pure functions and immutable data; guarantee program termination and predictable state convergence.
- **Crash resilience:** Ensure all file writes and database transactions are atomic to prevent corrupted data states after unexpected failures.
- **Exhaustive error handling:** Explicitly handle every potential failure mode; ban unhandled exceptions and generic error strings.
- **Transparent async UI:** Explicitly represent every asynchronous stage (idle, active processing, success, failure) in the UI so users are never trapped in silent failures.
- **Holistic atomic commits:** Keep commits small, self-contained, independently revertible, and bundled with their corresponding tests and documentation updates.
- **Strict quality verification:** Treat all linter warnings as errors and verify the codebase compiles and passes all tests before submitting work.
- **Minimal & mature dependencies:** Avoid unnecessary third-party libraries and enforce a minimum 48-hour release maturity rule for new package integrations.
- **Cross-platform compatibility:** Ensure all build, development, and testing scripts execute seamlessly across major operating systems without platform-specific syntax.
- **Restricted boundaries:** Respect project directory structures and never modify lockfiles, vendored code, or core instruction files unless explicitly requested.
- **Intent-driven documentation:** Write comments that exclusively explain *why* a decision or workaround exists, never *what* the syntax does.
- **Pre-submission validation:** Run all formatting, linting, unit, and fuzz testing verification commands prior to marking any task as complete.
