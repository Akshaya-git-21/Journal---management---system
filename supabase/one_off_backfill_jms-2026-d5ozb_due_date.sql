-- One-off (corrected): JMS-2026-D5OZB's two INVITED reviewer_assignments
-- rows already have a due_date -- it's just set to TODAY (2026-09-18), which
-- is due, not yet overdue, and the earlier version of this script's
-- "due_date is null" filter never matched because of that. Force it back to
-- a genuinely past date so Overdue -> Request Replacement can be tested
-- immediately.
-- Run this once in the Supabase SQL editor.

update public.reviewer_assignments
set due_date = current_date - 3
where manuscript_id = 'JMS-2026-D5OZB'
  and status in ('INVITED', 'ACCEPTED');

select id, reviewer_id, status, timeline_start_date, due_date
from public.reviewer_assignments
where manuscript_id = 'JMS-2026-D5OZB'
order by invited_at;
