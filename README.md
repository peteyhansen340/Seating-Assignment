# Seating Chart

Classroom seating charts for teachers: random generate, lock students, "can't sit here" zones, a free-form
room editor, multiple classes (periods) sharing one room, and a random name picker.

```bash
npm install
npm run dev      # http://localhost:5173
npm test
```

Without any setup the app runs **local-only**: everything is saved in this browser.

## Turn on accounts + cloud save (Supabase)

1. Create a free project at https://supabase.com.
2. **Database:** SQL Editor -> New query -> paste `supabase/schema.sql` -> Run. (Creates the tables and the
   row-level-security policies that keep each teacher's data private.)
3. **Keys:** Project Settings -> API. Copy the project URL and the `anon` public key into a new `.env`
   (see `.env.example`). Restart `npm run dev`.
4. **Sign-in methods:** Authentication -> Providers.
   - *Email* is on by default (magic link).
   - *Google*: enable it and paste a Google OAuth client ID/secret (Google Cloud Console -> Credentials ->
     OAuth client, type Web). Add Supabase's callback URL shown on that page as an authorized redirect URI.
5. **Redirects:** Authentication -> URL Configuration. Set Site URL to your app's address
   (`http://localhost:5173` while developing) and add it to Redirect URLs. Add your production URL when you deploy.

The anon key is safe to ship in the browser: row-level security is what protects the data.

## How it works

- The browser keeps the working copy (instant edits, works offline) and, when signed in, saves changes to
  Supabase a moment after you stop editing. The header shows *Saving… / Saved*.
- First sign-in offers to add any classes already on this device to your account.
- Signing out clears the teacher's data from the browser, so shared computers stay clean.
- Rooms are shared by every class that meets in them, so moving a bookshelf once updates all periods.

## Student privacy

Only student names (first names or initials are plenty) and seating restrictions are stored. Teachers can
remove everything with *Delete my saved data* in the account menu. If you deploy this for a school, check
your district's student-data rules (FERPA/COPPA or local equivalent) first.
