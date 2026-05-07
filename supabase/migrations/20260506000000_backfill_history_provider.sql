-- PP-614: Backfill provider for optimization history rows that were saved before
-- provider tracking was introduced.  All pre-tracking rows used Gemini (the only
-- provider at the time), so 'gemini' is the correct default.
UPDATE pp_optimization_history
SET provider = 'gemini'
WHERE provider IS NULL;
