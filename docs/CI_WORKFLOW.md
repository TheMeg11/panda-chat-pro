# CI workflow (manual installation required)

The deployment token used for this release does not carry the `workflow`
scope, so `.github/workflows/ci.yml` could not be pushed directly (GitHub
rejects workflow files from tokens without that scope).

**To activate CI, create `.github/workflows/ci.yml` in the repository with the
content below** (via the GitHub web UI or a token with `workflow` scope), then
commit. Everything else in this release is already pushed.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    name: Lint · Typecheck · Unit tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: ESLint
        run: npm run lint
      - name: TypeScript
        run: npm run typecheck
      - name: Unit tests
        run: npm test

  integration:
    name: Integration tests (Postgres)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: panda
          POSTGRES_PASSWORD: panda
          POSTGRES_DB: panda_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://panda:panda@localhost:5432/panda_test
      APP_SECRET: ci-secret-not-used-outside-tests-000000
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Init schema (sql/init.sql)
        run: node -e "const{readFileSync}=require('fs');const pg=require('pg');(async()=>{const c=new pg.Client({connectionString:process.env.DATABASE_URL});await c.connect();await c.query(readFileSync('sql/init.sql','utf8'));await c.end();console.log('schema ready')})()"
      - name: Run migrations (idempotency check)
        run: node scripts/db-migrate.mjs
      - name: Integration tests
        run: npm test

  build:
    name: Production build
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: postgresql://placeholder:placeholder@localhost:5432/placeholder
      APP_SECRET: build-time-placeholder-secret-32-chars
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Build
        run: npm run build
```
