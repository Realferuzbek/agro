-- Static, reproducible structure. npm run db:seed calculates and persists the canonical field twin.
insert into public.farms(id,name,region,is_public_demo)
  values('00000000-0000-4000-8000-000000000001','Tashkent Demo Farm','Tashkent Region, Uzbekistan',true) on conflict(id) do nothing;
insert into public.fields(id,farm_id,name,area_m2,settings)
  values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','North Potato Field',10000,
  '{"latitude":41.3,"elevationM":450,"widthM":100,"lengthM":100,"crop":"potato","plantingDate":"2026-03-01","seasonDays":90,"soil":"loam","irrigation":"drip","zoneCount":4,"zoneScheduling":"sequential","timezone":"Asia/Tashkent","assumption":"SIMULATION"}'::jsonb)
  on conflict(id) do nothing;
insert into public.parameter_sets(kind,version,name,parameters,source) values
('crop','potato-1.0.0','Potato · demo early season','{"kcbInitial":0.15,"kcbMid":1.10,"kcbEnd":0.65,"heightM":0.6,"rootDepthM":0.5,"pTable":0.35,"stageDays":[20,20,30,20],"referenceStageDays":[25,30,45,30]}',
 '{"title":"FAO Irrigation and Drainage Paper 56","organization":"FAO","year":1998,"url":"https://www.fao.org/4/x0490e/x0490e00.htm","notes":"90-day stage durations are a simulation assumption; coefficients are reference parameters, not universal local calibration."}'),
('soil','loam-1.0.0','Loam · reference demo profile','{"thetaFC":0.30,"thetaWP":0.14,"evaporationDepthM":0.10,"readilyEvaporableWaterMm":9,"initialDepletionMm":22,"initialEvaporationDepletionMm":17}',
 '{"title":"FAO-56 soil-water methodology","organization":"FAO","year":1998,"notes":"Demo soil profile, not a measured soil analysis."}'),
('policy','policy-1.0.0','Conservative demonstration policy','{"earlyWarningRawFraction":0.9,"actionRawFraction":1.0,"targetRawFraction":0.8,"rainEventQuietMinutes":30,"flowAnomalyFraction":0.2,"flowGraceSeconds":60}',
 '{"title":"Baraka Agro demonstration management policy","organization":"Baraka Agro","notes":"Configurable management assumptions; not universal FAO constants."}'),
('irrigation','drip-1.0.0','Four sequential drip zones','{"applicationEfficiency":0.9,"rowSpacingM":0.8,"emitterSpacingM":0.3,"emitterFlowLph":1,"zoneFlowsM3h":[10.5,10.3,10.4,10.2],"scheduling":"sequential"}',
 '{"title":"Baraka Agro conceptual drip system","organization":"Baraka Agro","notes":"Simulated pressure-compensating inline drip profile; no installed hardware."}')
on conflict(kind,version) do nothing;
