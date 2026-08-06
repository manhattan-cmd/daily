# Routine

Track your life with a structure you define yourself.

Routine has no fixed set of trackable things. You build the structure —
categories, subcategories, and the features measured on them — and every
number, chart and breakdown in the app is derived from that structure.

**Everything stays on your device.** No account, no server, no sync. The only
copy of your data is the one in your browser's storage plus the backups you
take yourself.

## The model

```
Category            Expenses            top-level heading
  Subcategory       Bills               nests as deep as you want
    Subcategory     Electricity
      Feature       Money (₺)           what gets measured here
Entry                                   one record, at a point in time
  Entry value       420 ₺               a feature's value on that entry
```

- **Feature** (`mod` in code) is a named atom in a global pool — "Money",
  "Duration", "Weight". Attach it to a category and the whole subtree inherits
  it; attach it to a single item and only that item has it.
- **Measure** (`entryType` in code) is how a feature is measured: a number with
  a unit, a 1–5 scale, a yes/no, a date range.
- A subcategory can be marked **regular** (rent, subscriptions) so analytics can
  exclude it with one tap.

Alongside entries there are **goals**, day **notes** (a journal whose words can
be linked to entries and other notes — the life map), and **activities** that
group entries from different categories into one session.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Database | Dexie (IndexedDB), schema v17 |
| Charts | Recharts |
| Shipping as | PWA today, native app store build later |

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run lint
npx tsc --noEmit   # typecheck
```

The UI is phone-shaped (390×844) and rendered inside a device frame on desktop.

## Data safety

Because the data lives only on the device, three things guard it:

1. **Persistent storage** is requested on launch — without it the browser may
   evict IndexedDB (iOS clears script storage for sites not opened in 7 days).
2. **Backups** export every table to a versioned JSON file, restorable either by
   merging (newest record wins) or replacing. Which tables belong in a backup is
   enforced at compile time, so a new table can't silently be left out.
3. **Deletions are logged** with the full record, so anything deleted can be
   undone for a while — and so a future sync can carry tombstones.

Data notes are in Turkish in the source comments; that is the working language
of the codebase. The product itself is English.
