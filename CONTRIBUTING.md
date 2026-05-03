# Contributing

Thanks for considering a contribution. This is a small project maintained by one person on the side, so a few things up front:

## What I'm interested in

- **Bug reports** — typos, broken links, code that doesn't run, docs that say something the code contradicts. Open an issue with the bug template.
- **Questions and discussion** — about the method, the patterns, the architecture choices. Open an issue with the question template; I'll answer in-thread.
- **Feedback** — "this maxim doesn't generalize," "this skill missed the obvious case," "the field-companion encryption section confused me" — that kind of thing. Open an issue with the feedback template. Negative feedback is welcome; it's how the bundle gets sharper.
- **Pattern contributions** — a new skill in `skills/`, a refinement to an existing one, a fork-friendly improvement to the starter scaffold. PR welcome; see below.
- **Documentation improvements** — clarifying confusing sections, fixing examples, adding a missing prerequisite. PR welcome.

## What I'm not interested in (please don't open these)

- **Style-only changes** that swap conventions for taste reasons (Prettier vs. not, single vs. double quotes, etc.). The project has a deliberate "minimal tooling, plain JS" stance.
- **New framework dependencies.** No build step. No React. No auth library. No observability vendor. The substrate is part of the value proposition.
- **Wholesale renames** of the method, the agent persona, or the directory layout.
- **Out-of-scope features** — multi-tenant auth, a typed schema validator, a productized SaaS template. The README's "What you're NOT getting" section enumerates these.

## How to open a PR

1. Fork the repo.
2. Make your change on a branch — one concern per PR. Refactors split from feature work, doc fixes split from code fixes.
3. **Run the same checks I run locally:**
   ```bash
   # Bash syntax
   bash -n starter/bootstrap.sh

   # JS syntax
   find starter -name "*.js" -exec node --check {} \;

   # SQL syntax
   sqlite3 :memory: ".read starter/planning/migrations/0001_initial.sql"
   sqlite3 :memory: ".read starter/field/migrations/0001_initial.sql"
   ```
4. Push your branch and open a PR against `main`. The PR template has a checklist.

## How merging works

- **Squash merge.** Each PR lands as a single commit on `main` with a clean message. Your authorship is preserved in the squash commit metadata.
- **One reviewer (me) for now.** I'll respond within roughly a week. If I'm slow, ping me — life happens.
- **Small PRs land faster.** A 20-line PR with one purpose lands in days. A 500-line PR with five concerns takes weeks because I have to mentally re-page-in each concern.
- **Drafts welcome.** If you're not sure your idea is in scope, open a draft PR or an issue first and we'll talk.

## Response cadence

This is a side project. Realistic expectations:

- **Issues:** I'll triage within a week. Most of the time faster.
- **PRs:** I'll review within a week. Bug fixes and doc patches usually land same-day.
- **Slow weeks happen.** If you've heard nothing for two weeks, a polite ping in-thread is fine.

## License

By contributing, you're agreeing your contribution is licensed under [PolyForm Noncommercial 1.0.0](LICENSE) — the same terms as the rest of the project. If you've never read PolyForm, the short version is: free for personal, hobby, research, charitable, educational use; commercial use requires a separate license from the copyright holder.

## Code of conduct

Be civil. Disagreement is welcome; contempt isn't. If something feels off, you can email me directly (`caweis@mac.com`) instead of escalating in-thread. I'll handle it.
