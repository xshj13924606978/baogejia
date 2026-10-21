# Legacy permission migration guide disabled

Do not execute the historical SQL in this directory directly. Repository-supported
schema migrations must use:

```text
node scripts/migration-runner.mjs help
```

Historical migrations below version 127 require a separately reviewed adoption or
replacement plan; the Runner will not execute or trust them automatically.
