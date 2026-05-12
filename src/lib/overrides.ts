import type { ManualOverrides, PropertyAnalysis } from "./types";

export const ENERGY_LABELS = ["A+++", "A++", "A+", "A", "B", "C", "D", "E", "F", "G"];

export function applyManualOverrides(a: PropertyAnalysis, overrides?: ManualOverrides): PropertyAnalysis {
  if (!overrides || Object.values(overrides).every((v) => v === undefined || v === false || v === "")) return a;

  const listing = { ...(a.listing ?? {}) };
  if (overrides.energielabel) listing.energielabel = overrides.energielabel;
  if (typeof overrides.living_area_m2 === "number") listing.m2 = overrides.living_area_m2;
  if (typeof overrides.asking_price === "number") {
    listing.prijs = overrides.asking_price;
    listing.vraagprijs = overrides.asking_price;
  }
  if (typeof overrides.rooms === "number") listing.kamers = overrides.rooms;
  if (typeof overrides.build_year === "number") listing.bouwjaar = overrides.build_year;

  const bag = a.bag ? { ...a.bag } : undefined;
  if (bag && typeof overrides.living_area_m2 === "number") bag.oppervlakte = overrides.living_area_m2;
  if (bag && typeof overrides.build_year === "number") bag.bouwjaar = overrides.build_year;

  return {
    ...a,
    listing,
    bag,
    energielabel: overrides.energielabel
      ? { ...(a.energielabel ?? { label: overrides.energielabel }), label: overrides.energielabel, bron: "Handmatig ingevoerd" }
      : a.energielabel,
    is_apartment: overrides.plot_not_applicable ? true : a.is_apartment,
    perceel_m2: overrides.plot_not_applicable ? undefined : typeof overrides.plot_area_m2 === "number" ? overrides.plot_area_m2 : a.perceel_m2,
    manual_overrides: overrides,
    field_sources: {
      ...(a.field_sources ?? {}),
      ...(overrides.energielabel ? { energy_label: "handmatig" as const } : {}),
      ...(typeof overrides.living_area_m2 === "number" ? { living_area_m2: "handmatig" as const } : {}),
      ...(typeof overrides.plot_area_m2 === "number" || overrides.plot_not_applicable ? { plot_area_m2: "handmatig" as const } : {}),
      ...(typeof overrides.asking_price === "number" ? { asking_price: "handmatig" as const } : {}),
      ...(typeof overrides.rooms === "number" ? { rooms: "handmatig" as const } : {}),
      ...(typeof overrides.build_year === "number" ? { build_year: "handmatig" as const } : {}),
    },
  };
}