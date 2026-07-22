# Supabase Setup Next Steps

Use this when you are ready to run CommandLoop with durable Supabase Postgres and private audio storage.

## 1. Create Supabase Project

1. Create a new Supabase project.
2. Open Project Settings > API.
3. Copy:
   - Project URL
   - anon public key
   - service_role key

Never expose the service-role key to the browser.

## 2. Configure Environment

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=choose-a-real-password
ADMIN_SESSION_SECRET=use-a-long-random-secret
OPENAI_API_KEY=
```

Generate `ADMIN_SESSION_SECRET` with a password manager or:

```bash
openssl rand -base64 32
```

## 3. Run Migration

In Supabase SQL Editor, run:

```sql
-- paste contents of supabase/migrations/202607100001_initial_schema.sql
```

This creates:

- relational tables for contributors, recipes, prompts, sessions, recordings, reviews, STT results, and metrics
- indexes and uniqueness constraints
- private `command-audio` storage bucket

If the app reports that `public.evaluation_metrics` is missing, run the repair migration:

```sql
-- paste contents of supabase/migrations/202607100002_ensure_evaluation_metrics.sql
```

## 4. Seed Initial Data

The app seeds recipes, prompts, quotas, and STT model configs into Supabase automatically on the first Supabase-backed read. It seeds by stable recipe slug, prompt display order, quota dimension, and model identifier, then uses Supabase UUIDs as the runtime IDs.

## 5. Runtime Data Store

When `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are present, server routes use the Supabase-backed repository. Without those values, or when `COMMANDLOOP_DATA_BACKEND=memory`, the app uses the local in-memory store.

Browser uploads currently pass through `/api/recordings/submit`; the server writes audio to the private `command-audio` bucket and stores metadata in Postgres.

## 6. Storage Upload Flow

Implemented server-mediated flow:

1. Browser records audio.
2. Browser posts the audio blob and metadata to `/api/recordings/submit`.
3. Server validates MIME type, size, session, and assignment.
4. Server uploads audio to private `command-audio`.
5. Server inserts recording metadata into Postgres.

Future scaling option: move to signed direct browser uploads for large-scale collection.

## 7. Production Hardening

Before public launch:

- Add explicit CSRF tokens for admin mutations.
- Add durable per-contributor and per-admin rate limiting.
- Add audit logs for admin review/delete/export actions.
- Add retention and withdrawal jobs for storage cleanup.
- Add Row Level Security policies if you expose any client-side Supabase reads.
- Move demo seeding endpoint behind development-only builds or remove it.
- Configure Vercel environment variables and Supabase project secrets.

## 8. Verification Checklist

After Supabase integration:

```bash
CI=true ./node_modules/.bin/pnpm typecheck
CI=true ./node_modules/.bin/pnpm lint
CI=true ./node_modules/.bin/pnpm test
CI=true ./node_modules/.bin/pnpm test:e2e
CI=true ./node_modules/.bin/pnpm build
```

Then manually verify:

- contributor can submit a real recording
- audio appears in private `command-audio`
- metadata persists after server restart
- admin can play audio through signed URL
- review acceptance makes recording evaluation-eligible
- mock STT evaluation persists results and metrics
