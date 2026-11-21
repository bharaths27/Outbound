-- Starter quests (17) at Angie's mock stations + BU Central, so the core loop works before Suki's content lands.
-- Run AFTER seed_stations.sql. Safe to re-run: existing quest ids are left alone (edit them in Supabase freely).
-- Coordinates are approximate (within ~50 m). Suki: check each pin on Google Maps before real, on-location check-ins.
-- Demo accounts (profiles.is_demo) can check in without location, so the demo works either way.
-- Hours are "HH:MM-HH:MM" (Boston time, end < start means past midnight) or "always". Hours are approximate too.
insert into public.quests
  (id, station_id, type, title, description, lat, lon, price_tier, vibe_tags, hours, xp, checkin_radius_m, qr_code, duration_min, walk_min)
values
  -- Kenmore
  ('kenmore-citgo-sign', 'place-kencl', 'scenic', 'Selfie under the Citgo sign',
   'The most famous sign in Boston, right above Kenmore Square.', 42.3489, -71.0953, 0,
   array['photo-spot','iconic'], 'always', 50, 100, null, 10, 1),
  ('kenmore-fenway-park', 'place-kencl', 'scenic', 'Lap around Fenway Park',
   'Walk Jersey Street and Lansdowne Street around the oldest ballpark in the majors.', 42.3467, -71.0972, 0,
   array['iconic','sports','outdoors'], 'always', 50, 120, null, 20, 4),
  -- Park Street
  ('parkst-frog-pond', 'place-pktrm', 'scenic', 'Frog Pond on Boston Common',
   'Skating in winter, spray pool in summer, people watching all year.', 42.3560, -71.0655, 0,
   array['outdoors','iconic','date-night'], 'always', 50, 120, null, 20, 4),
  ('parkst-granary', 'place-pktrm', 'scenic', 'Find Paul Revere at the Granary',
   'Burying ground on the Freedom Trail with Paul Revere, John Hancock and Sam Adams.', 42.3573, -71.0617, 0,
   array['history','freedom-trail'], '09:00-17:00', 50, 75, null, 15, 2),
  ('parkst-state-house', 'place-pktrm', 'scenic', 'Golden dome of the State House',
   'Climb Park Street to the gold dome at the top of Beacon Hill.', 42.3587, -71.0637, 0,
   array['history','photo-spot'], 'always', 50, 100, null, 10, 3),
  -- Harvard
  ('harvard-john-harvard', 'place-harsq', 'scenic', 'Rub John Harvard''s shoe',
   'The statue in Harvard Yard. Tradition says it brings luck.', 42.3745, -71.1172, 0,
   array['campus','iconic','photo-spot'], 'always', 50, 100, null, 15, 4),
  ('harvard-felipes', 'place-harsq', 'food', 'Burrito on Felipe''s rooftop',
   'Cheap, huge burritos with a rooftop view of Harvard Square.', 42.3729, -71.1202, 1,
   array['late-night','rooftop','group-friendly'], '10:00-23:00', 60, 75, null, 40, 3),
  -- Central
  ('central-graffiti-alley', 'place-cntsq', 'scenic', 'Walk Graffiti Alley',
   'A legal graffiti wall that changes every week, off Mass Ave.', 42.3634, -71.1010, 0,
   array['street-art','photo-spot'], 'always', 50, 75, null, 15, 4),
  ('central-toscaninis', 'place-cntsq', 'food', 'Ice cream at Toscanini''s',
   'Cambridge ice cream institution. Try the burnt caramel.', 42.3631, -71.0986, 1,
   array['dessert','date-night'], '11:00-23:00', 60, 75, null, 25, 7),
  -- Chinatown
  ('chinatown-gate', 'place-chncl', 'scenic', 'Through the Chinatown Gate',
   'The paifang gate at the start of Beach Street.', 42.3511, -71.0605, 0,
   array['photo-spot','culture'], 'always', 50, 75, null, 10, 3),
  ('chinatown-dumplings', 'place-chncl', 'food', 'Dumplings on Beach Street',
   'Pick any dumpling spot on Beach Street and split a plate with your squad.', 42.3512, -71.0612, 1,
   array['dumplings','group-friendly','late-night'], '11:00-23:00', 60, 120, null, 45, 3),
  -- Haymarket
  ('haymarket-pushcarts', 'place-haecl', 'event', 'Haymarket pushcart market',
   'Open-air produce market on Blackstone Street, Fridays and Saturdays only.', 42.3617, -71.0568, 0,
   array['market','outdoors','local'], '07:00-17:00', 80, 100, null, 20, 2),
  ('haymarket-public-market', 'place-haecl', 'food', 'Snack crawl at Boston Public Market',
   'Indoor market where everything is made or grown in New England.', 42.3619, -71.0574, 1,
   array['local','market','group-friendly'], '09:00-19:00', 60, 75, null, 30, 2),
  ('haymarket-quincy-market', 'place-haecl', 'food', 'Chowder at Quincy Market',
   'The food hall behind Faneuil Hall. Get chowder in a bread bowl.', 42.3600, -71.0549, 2,
   array['iconic','chowder','group-friendly'], '10:00-21:00', 60, 100, null, 40, 6),
  -- Copley
  ('copley-bpl-courtyard', 'place-coecl', 'scenic', 'Boston Public Library courtyard',
   'Quiet courtyard and Bates Hall reading room in the McKim building.', 42.3493, -71.0782, 0,
   array['study-spot','architecture','quiet'], '09:00-17:00', 50, 100, null, 25, 1),
  ('copley-trinity-reflection', 'place-coecl', 'scenic', 'Trinity Church in the Hancock tower',
   'Find the spot where Trinity Church reflects in the glass tower behind it.', 42.3499, -71.0752, 0,
   array['photo-spot','architecture'], 'always', 50, 100, null, 10, 2),
  -- BostonHacks expo (QR check-in at our table)
  ('bu-gsu-expo', 'place-bucen', 'event', 'Find Outbound at the BostonHacks expo',
   'Scan the QR code at our table in the GSU Metcalf Ballroom.', 42.3509, -71.1089, 0,
   array['hackathon','campus'], 'always', 100, 150, 'OUTBOUND-EXPO', 10, 2)
on conflict (id) do nothing;
