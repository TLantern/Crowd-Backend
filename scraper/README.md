## Funnels

### Funnel 1: Engage org events (`fetch_engage.js`)
- Crawl `unt.campuslabs.com/engage/organizations`
- For each org slug:
  - Load `/organization/{slug}/events`
  - Visit each `/event/{id}`
  - Extract title, org, start/end time, location
- Write raw -> `events_from_engage_raw`
- Normalize -> `campus_events_live` with `sourceType: "engage"`

### Funnel 2: Official university calendar (`fetch_official.js`)
- Call `calendar.unt.edu/api/2/events?days=14&pp=200`
- Write raw -> `events_from_official_raw`
- Normalize -> `campus_events_live` with `sourceType: "official"`

### Funnel 3: Instagram (optional, nightlife) (`scrape_instagram.js`)
- Playwright login to IG burner
- Pull captions from top social orgs
- Parse "tonight 7pm Union rm 241"
- Write raw -> `events_from_instagram_raw`
- Normalize -> `campus_events_live` with `sourceType: "instagram"`

### Cleanup (`cleanup.js`)
- Delete `campus_events_live` docs that are:
  - >12h past start
  - >14 days in future
  - invalid time

### iOS app
- Listens only to `campus_events_live`
- Converts each event to `CrowdEvent`
- Category + emoji are inferred client-side
- Map/UI doesn't care if event came from Engage, official calendar, or IG
