/**
 * Localised names for the service catalogue. The database keeps the English
 * label as the canonical value; these are display-only translations.
 * Route experiences keep their proper place names and only translate the
 * "Route" prefix.
 */
import { getLang, t, type Lang } from "./i18n";

type ServiceDict = Record<string, string>;

const SERVICE_LABELS: Record<Exclude<Lang, "en">, ServiceDict> = {
  pt: {
    breakfast: "Pequeno-almoço",
    lunch: "Almoço",
    dinner: "Jantar",
    room_service: "Serviço de quarto",
    laundry: "Lavandaria",
    extra_night: "Noite extra",
    other: "Outro",
    itinerary_planning: "Planeamento de itinerário / visitas",
    activity: "Caminhada guiada",
    climbing: "Escalada",
    downhill: "Descida (downhill)",
    yoga: "Sessão de yoga",
    mule_support: "Apoio logístico com mulas",
    local_guide: "Guia local",
    transfer: "Transfer do aeroporto",
    taxi: "Chamar táxi",
    support_4x4: "Apoio 4x4",
    visit_chefchaouen: "Visita / excursão a Chefchaouen",
    visit_mediterranean_coast: "Excursão à costa mediterrânica",
    visit_tangier: "Visita / excursão a Tânger",
    facility_wifi: "WiFi grátis",
    facility_parking: "Estacionamento grátis",
    facility_non_smoking: "Quartos para não fumadores",
    facility_family_rooms: "Quartos familiares",
    facility_restaurant: "Restaurante",
  },
  fr: {
    breakfast: "Petit-déjeuner",
    lunch: "Déjeuner",
    dinner: "Dîner",
    room_service: "Service en chambre",
    laundry: "Blanchisserie",
    extra_night: "Nuit supplémentaire",
    other: "Autre",
    itinerary_planning: "Organisation d'itinéraire / visites",
    activity: "Randonnée guidée",
    climbing: "Escalade",
    downhill: "Descente (downhill)",
    yoga: "Séance de yoga",
    mule_support: "Assistance logistique avec mules",
    local_guide: "Guide local",
    transfer: "Transfert aéroport",
    taxi: "Appel de taxi",
    support_4x4: "Assistance 4x4",
    visit_chefchaouen: "Visite / excursion à Chefchaouen",
    visit_mediterranean_coast: "Excursion côte méditerranéenne",
    visit_tangier: "Visite / excursion à Tanger",
    facility_wifi: "WiFi gratuit",
    facility_parking: "Parking gratuit",
    facility_non_smoking: "Chambres non-fumeurs",
    facility_family_rooms: "Chambres familiales",
    facility_restaurant: "Restaurant",
  },
  ar: {
    breakfast: "الفطور",
    lunch: "الغداء",
    dinner: "العشاء",
    room_service: "خدمة الغرف",
    laundry: "غسيل الملابس",
    extra_night: "ليلة إضافية",
    other: "أخرى",
    itinerary_planning: "تنظيم برنامج الزيارات",
    activity: "جولة مشي مع مرشد",
    climbing: "تسلق",
    downhill: "نزول جبلي",
    yoga: "حصة يوغا",
    mule_support: "دعم لوجستي بالبغال",
    local_guide: "مرشد محلي",
    transfer: "نقل من المطار",
    taxi: "طلب سيارة أجرة",
    support_4x4: "دعم بسيارة رباعية الدفع",
    visit_chefchaouen: "زيارة شفشاون",
    visit_mediterranean_coast: "رحلة إلى الساحل المتوسطي",
    visit_tangier: "زيارة طنجة",
    facility_wifi: "واي فاي مجاني",
    facility_parking: "موقف سيارات مجاني",
    facility_non_smoking: "غرف لغير المدخنين",
    facility_family_rooms: "غرف عائلية",
    facility_restaurant: "مطعم",
  },
};

/** Display name for a catalogue service in the active language. */
export function serviceLabel(
  service:
    | { key?: string | null; label: string; name_i18n?: Record<string, string> | null }
    | null
    | undefined,
): string {
  if (!service) return "—";
  const key = service.key ?? "";
  const lang = getLang();
  // Custom catalogue items carry their own translations: current language,
  // then English, then the stored label. Predefined keys are untouched.
  const custom = service.name_i18n ?? null;
  if (custom) {
    const value = (custom[lang] ?? custom["en"] ?? "").trim();
    if (value) return value;
  }
  if (key.startsWith("route_")) {
    const place = service.label.replace(/^Route:\s*/i, "");
    return `${t("routePrefix")}: ${place}`;
  }
  if (lang === "en") return service.label;
  return SERVICE_LABELS[lang]?.[key] ?? service.label;
}

export function activityModeLabel(mode: string | null | undefined): string | null {
  if (!mode) return null;
  if (/pedestrian/i.test(mode)) return t("modePedestrian");
  if (/bike/i.test(mode)) return t("modeBike");
  return mode;
}

export function difficultyLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/easy/i.test(value)) return t("diffEasy");
  if (/medium/i.test(value)) return t("diffMedium");
  if (/expert|hard/i.test(value)) return t("diffExpert");
  return value;
}

/** Short description for a catalogue item, with language -> English fallback. */
export function serviceDescription(
  service:
    | { short_description?: string | null; description_i18n?: Record<string, string> | null }
    | null
    | undefined,
): string | null {
  if (!service) return null;
  const dict = service.description_i18n ?? null;
  if (dict) {
    const value = (dict[getLang()] ?? dict["en"] ?? "").trim();
    if (value) return value;
  }
  return service.short_description ?? null;
}
