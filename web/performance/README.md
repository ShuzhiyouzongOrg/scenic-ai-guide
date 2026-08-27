# Web performance governance

- `resource-budget.json` defines warning-only initial transfer budgets. Run
  `pnpm quality:budget`; add `-- --enforce` only after the team promotes the
  current warning thresholds to release gates.
- `budgets/baseline.json` is the checked-in comparison point. Refresh it
  deliberately with `pnpm quality:budget:baseline` and review the recorded
  commit, dirty flag and metric deltas.
- `sensitive-scan.json` scans both public output and private sourcemaps. Reports
  never include matched secret text. The explicit `allowedClientEnvironmentNames`
  list contains only provider values that the existing browser SDK contract already
  requires to be public; server-side credentials remain subject to scanning.
- Production static delivery serves build-time Brotli (`br`) or gzip (`gzip`)
  representations when available, keeps `Vary: Accept-Encoding` and uses separate
  validators for each representation. The server test covers identity, br, gzip,
  conditional requests, MIME types, cache policy, HEAD and missing-resource paths.
- Production builds create hidden sourcemaps, move them outside `dist` into
  `performance/artifacts/sourcemaps`, and record a version/commit/build mapping.
  The artifact and report directories are intentionally ignored by Git and are
  uploaded by CI with limited retention.
- The Web quality workflow pins Chrome 151 and Lighthouse 13.4.1, covers login,
  registration and forgotten-password routes, and runs mobile and desktop profiles
  three times each. Raw JSON and a median summary are uploaded without blocking on
  one noisy score during the initial rollout.
