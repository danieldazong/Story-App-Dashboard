-- reading_positions.updated_at: set by the server on every write, for the
-- Talebrim mobile app's read/listen parity writer (its AGENTS.md, State
-- Management Rules, parity step 3).
--
-- PURELY ADDITIVE. Creates one trigger on the mobile app's own table, reusing
-- the existing set_updated_at() from 20260916000001. Alters no table, column,
-- view, function or policy, so the dashboard's queries, generated types and
-- RLS behaviour are unchanged.
--
-- updated_at is the parity conflict clock: last write wins against the SERVER
-- timestamp, never a device clock. 20260923121634 only defaulted it on insert,
-- so an upsert that hit an existing row kept the old time. BEFORE INSERT as
-- well as UPDATE, so a client can never supply its own time on either path.

create trigger reading_positions_set_updated_at
  before insert or update on public.reading_positions
  for each row
  execute function public.set_updated_at();

-- Teardown (local resets only)
-- drop trigger if exists reading_positions_set_updated_at on public.reading_positions;
