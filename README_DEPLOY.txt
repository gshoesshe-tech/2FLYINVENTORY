DEPLOY (Netlify + GitHub)
1) Edit config.js and set SUPABASE_URL + SUPABASE_ANON_KEY.
2) Upload/commit ALL files (including _headers) to your repo root.
3) Netlify Site settings:
   - Build command: (leave empty)
   - Publish directory: /  (root)
4) After deploy, hard refresh: Ctrl+Shift+R.

SUPABASE SETUP
- Run the SQL prompt from ChatGPT in Supabase SQL Editor.
- Create users in Supabase Auth (email/password).
- After your owner account signs up, set your role to 'owner' in public.profiles table.
