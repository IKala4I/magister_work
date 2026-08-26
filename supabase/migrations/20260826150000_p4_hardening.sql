-- P4 adversarial-pass hardening (findings m4, n3).
--
-- m4: the chronotype CHECK's first branch (chronotype_class IS NULL) accepted a stored
-- score alongside survey_skipped = true, so "skipped survey with a score" was representable
-- at rest (contra File 04 §3.1) even though completion forces consistency. Make the rule
-- unconditional: a skipped survey can never carry a score, class or no class.
alter table public.profiles
  add constraint profiles_skipped_has_no_score check (rmeq_score is null or not survey_skipped);

-- n3: chronotype_seed_cluster kept the default PUBLIC EXECUTE. Harmless (immutable pure
-- mapper), but inconsistent with this schema's explicit-grants discipline.
revoke execute on function public.chronotype_seed_cluster(text) from public, anon;
