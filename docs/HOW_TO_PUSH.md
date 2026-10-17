# How to push the feature branch to GitHub

The sandbox cannot authenticate to GitHub. Run these commands locally:

```bash
# Clone the repo if you haven't already
git clone https://github.com/nitishdotdev/CampusMove.git
cd CampusMove

# Fetch what the remote has
git fetch origin

# The feature branch has all the work. Pull it if it's already there,
# or create it from the remote if not:
git checkout campusmove-mern-rebuild-d9c7ac4
git pull origin campusmove-mern-rebuild-d9c7ac4

# Alternatively: to get the work from this sandbox, first export it as a bundle
# (see the bundle instructions below) then import it into your local clone.
```

## If you have a local copy of the sandbox changes

In the sandbox the branch is `campusmove-mern-rebuild-d9c7ac4` with these commits (newest first):

1. `f7a1aee` — Auth: AuthService, CRUD repos, acceptance checklist, session handoff docs
2. `cf77c08` — GPS ingestion, Mongoose models, Socket.IO gateway, CI
3. `4f29dba` — PostgreSQL TLS rebuild
4. `bc8ed49` — schema fixes, verify-all fix, CI workflow
5. `57895a3` — CORS allowlist, real analytics, TLS with host binding
6. `e6a1867` — nav JSX fix, JWT enforcement, source-map-js

To push the branch:

```bash
git push origin campusmove-mern-rebuild-d9c7ac4
```

## To create a PR from the branch

1. Go to `https://github.com/nitishdotdev/CampusMove/compare/campusmove-mern-rebuild-d9c7ac4`
2. Click **"Create pull request"**
3. Title: `feat: MERN rebuild — security, GPS, auth, MongoDB`
4. Do NOT merge until:
   - The auth integration tests pass on real MongoDB
   - The frontend is connected to `apps/api`
   - Production data migration is confirmed or declared unnecessary

## Important: Do not merge to main yet

The feature branch is not production-ready. The app still runs on the legacy PostgreSQL/file server. Merge to main only after all items in `docs/ACCEPTANCE_CHECKLIST.md` are VERIFIED.
