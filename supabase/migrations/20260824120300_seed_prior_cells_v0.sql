-- prior_cells version 0 — day-zero bootstrap priors computed exactly per File 04 §3.2–3.3.
-- Deep anchor matrix -> logit-affine category transform -> weekend blend.
-- n0 semantics (specs/07 + spec-conflicts M5): stored n0 is the day-type base
-- (8 weekday, 4 weekend = "halved"); the per-user multipliers (×0.5 outside declared
-- working hours, ×0.5 if the survey was skipped) are applied when user beta_cells are
-- instantiated at onboarding (P4). Refreshed quarterly by empirical Bayes (File 04 §3.5)
-- as new versions with a model_registry row (kind='priors').

with anchor(chronotype_class, daypart, mu_deep) as (
  values
    ('DM','EM',0.78),('MM','EM',0.70),('INT','EM',0.55),('ME','EM',0.42),('DE','EM',0.35),
    ('DM','MO',0.74),('MM','MO',0.72),('INT','MO',0.66),('ME','MO',0.55),('DE','MO',0.48),
    ('DM','MD',0.50),('MM','MD',0.52),('INT','MD',0.52),('ME','MD',0.52),('DE','MD',0.50),
    ('DM','AF',0.55),('MM','AF',0.58),('INT','AF',0.62),('ME','AF',0.64),('DE','AF',0.62),
    ('DM','EV',0.40),('MM','EV',0.48),('INT','EV',0.58),('ME','EV',0.68),('DE','EV',0.72),
    ('DM','NT',0.30),('MM','NT',0.36),('INT','NT',0.48),('ME','NT',0.62),('DE','NT',0.74)
),
category(category, gamma, delta, delta_af) as (
  values
    ('deep',     1.00,  0.00, 0.00),
    ('admin',    0.45,  0.25, 0.00),
    ('physical', 0.55,  0.10, 0.35),
    ('learning', 0.85, -0.05, 0.00)
),
weekday_mu as (
  select a.chronotype_class, c.category, a.daypart,
         1.0 / (1.0 + exp(-(
           c.gamma * ln(a.mu_deep / (1.0 - a.mu_deep))
           + c.delta
           + case when a.daypart = 'AF' then c.delta_af else 0.0 end
         ))) as mu
  from anchor a cross join category c
)
insert into public.prior_cells (version, chronotype_class, category, daypart, day_type, mu0, n0)
select 0, chronotype_class, category, daypart, day_type,
       case day_type when 'weekday' then mu else 0.5 * mu + 0.5 * 0.55 end,
       case day_type when 'weekday' then 8.0 else 4.0 end
from weekday_mu cross join (values ('weekday'), ('weekend')) as dt(day_type);
