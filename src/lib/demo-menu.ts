/**
 * PREVIEW-ONLY demo food menu.
 *
 * Frontend configuration only: nothing here is written to, or read from, the
 * database. Prices are fictional placeholders in MAD and exist purely so the
 * cross-sell / menu-engineering UX can be evaluated before the real menu
 * arrives. Replace `DEMO_MENU` with backend-managed dishes later.
 */
import type { Lang } from "./i18n";

export type DemoCategory = "signature" | "mains" | "drinks" | "desserts";

export type DemoDish = {
  id: string;
  name: Record<Lang, string>;
  description: Record<Lang, string>;
  category: DemoCategory;
  priceMad: number;
  signature?: boolean;
  featured?: boolean;
  recommendationIds: string[];
  arAvailable?: boolean;
  arTarget?: string;
};

/** Only shown on Lovable preview hosts — never on the live domains. */
export function isDemoPreviewHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  // Development / Lovable preview drafts only.
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (h.includes("id-preview--")) return true;
  // Always hide on the published custom domains and normal Lovable production hosts.
  if (h === "caiat-portal.com" || h === "www.caiat-portal.com") return false;
  if (h === "caiat-portal.lovable.app") return false;
  if (h.endsWith(".lovable.app")) return false;
  return false;
}

export const DEMO_MENU: DemoDish[] = [
  {
    id: "kefta-tajine",
    name: {
      en: "Caiat Kefta Tajine",
      pt: "Tajine de Kefta Caiat",
      fr: "Tajine Kefta Caiat",
      ar: "طاجين الكفتة كايات",
    },
    description: {
      en: "Beef meatballs, tomato, egg and herbs",
      pt: "Almôndegas de vaca, tomate, ovo e ervas",
      fr: "Boulettes de bœuf, tomate, œuf et herbes",
      ar: "كرات لحم البقر والطماطم والبيض والأعشاب",
    },
    category: "signature",
    priceMad: 140,
    signature: true,
    featured: true,
    recommendationIds: ["moroccan-salad", "mint-tea", "pastries"],
    arAvailable: true,
    arTarget: "caiat-tajine",
  },
  {
    id: "chicken-tajine",
    name: {
      en: "Chicken tajine with preserved lemon",
      pt: "Tajine de frango com limão em conserva",
      fr: "Tajine de poulet au citron confit",
      ar: "طاجين الدجاج بالليمون المخلل",
    },
    description: {
      en: "Slow-cooked chicken, olives, preserved lemon",
      pt: "Frango cozinhado lentamente, azeitonas, limão",
      fr: "Poulet mijoté, olives, citron confit",
      ar: "دجاج مطهو ببطء مع الزيتون والليمون",
    },
    category: "mains",
    priceMad: 130,
    recommendationIds: ["moroccan-salad", "mint-tea"],
  },
  {
    id: "vegetable-tajine",
    name: {
      en: "Vegetable tajine",
      pt: "Tajine de legumes",
      fr: "Tajine de légumes",
      ar: "طاجين الخضار",
    },
    description: {
      en: "Seasonal vegetables and mild spices",
      pt: "Legumes da época e especiarias suaves",
      fr: "Légumes de saison et épices douces",
      ar: "خضار موسمية وتوابل خفيفة",
    },
    category: "mains",
    priceMad: 110,
    recommendationIds: ["mint-tea", "fruit-plate"],
  },
  {
    id: "couscous",
    name: { en: "Couscous", pt: "Cuscuz", fr: "Couscous", ar: "كسكس" },
    description: {
      en: "Semolina, seven vegetables, broth",
      pt: "Sêmola, sete legumes, caldo",
      fr: "Semoule, sept légumes, bouillon",
      ar: "سميد وسبع خضروات ومرق",
    },
    category: "mains",
    priceMad: 120,
    recommendationIds: ["mint-tea", "fruit-plate"],
  },
  {
    id: "harira",
    name: { en: "Harira soup", pt: "Sopa harira", fr: "Soupe harira", ar: "حريرة" },
    description: {
      en: "Tomato, lentils and chickpeas",
      pt: "Tomate, lentilhas e grão",
      fr: "Tomate, lentilles et pois chiches",
      ar: "طماطم وعدس وحمص",
    },
    category: "mains",
    priceMad: 55,
    recommendationIds: ["pastries", "mint-tea"],
  },
  {
    id: "moroccan-salad",
    name: {
      en: "Moroccan salad",
      pt: "Salada marroquina",
      fr: "Salade marocaine",
      ar: "سلطة مغربية",
    },
    description: {
      en: "Tomato, cucumber, onion, olive oil",
      pt: "Tomate, pepino, cebola, azeite",
      fr: "Tomate, concombre, oignon, huile d'olive",
      ar: "طماطم وخيار وبصل وزيت الزيتون",
    },
    category: "mains",
    priceMad: 45,
    recommendationIds: ["mint-tea"],
  },
  {
    id: "moroccan-breakfast",
    name: {
      en: "Moroccan breakfast",
      pt: "Pequeno-almoço marroquino",
      fr: "Petit-déjeuner marocain",
      ar: "فطور مغربي",
    },
    description: {
      en: "Breads, olive oil, honey, amlou, eggs",
      pt: "Pães, azeite, mel, amlou, ovos",
      fr: "Pains, huile d'olive, miel, amlou, œufs",
      ar: "خبز وزيت الزيتون والعسل وأملو والبيض",
    },
    category: "mains",
    priceMad: 85,
    recommendationIds: ["orange-juice", "mint-tea"],
  },
  {
    id: "grilled-chicken",
    name: {
      en: "Grilled chicken plate",
      pt: "Prato de frango grelhado",
      fr: "Assiette de poulet grillé",
      ar: "طبق دجاج مشوي",
    },
    description: {
      en: "Marinated chicken, fries, salad",
      pt: "Frango marinado, batatas, salada",
      fr: "Poulet mariné, frites, salade",
      ar: "دجاج متبل مع البطاطس والسلطة",
    },
    category: "mains",
    priceMad: 125,
    recommendationIds: ["moroccan-salad", "orange-juice"],
  },
  {
    id: "mint-tea",
    name: {
      en: "Moroccan mint tea",
      pt: "Chá de menta marroquino",
      fr: "Thé à la menthe",
      ar: "أتاي بالنعناع",
    },
    description: {
      en: "Green tea, fresh mint",
      pt: "Chá verde, menta fresca",
      fr: "Thé vert, menthe fraîche",
      ar: "شاي أخضر ونعناع طازج",
    },
    category: "drinks",
    priceMad: 25,
    recommendationIds: [],
  },
  {
    id: "orange-juice",
    name: {
      en: "Fresh orange juice",
      pt: "Sumo de laranja natural",
      fr: "Jus d'orange frais",
      ar: "عصير برتقال طازج",
    },
    description: {
      en: "Pressed to order",
      pt: "Espremido na hora",
      fr: "Pressé à la commande",
      ar: "يُعصر عند الطلب",
    },
    category: "drinks",
    priceMad: 30,
    recommendationIds: [],
  },
  {
    id: "fruit-plate",
    name: {
      en: "Seasonal fruit plate",
      pt: "Prato de fruta da época",
      fr: "Assiette de fruits de saison",
      ar: "طبق فواكه موسمية",
    },
    description: {
      en: "Whatever is ripe that day",
      pt: "O que estiver maduro nesse dia",
      fr: "Selon la saison du jour",
      ar: "حسب فواكه اليوم",
    },
    category: "desserts",
    priceMad: 40,
    recommendationIds: ["mint-tea"],
  },
  {
    id: "pastries",
    name: {
      en: "Moroccan pastries",
      pt: "Doces marroquinos",
      fr: "Pâtisseries marocaines",
      ar: "حلويات مغربية",
    },
    description: {
      en: "Almond and honey selection",
      pt: "Seleção de amêndoa e mel",
      fr: "Sélection amande et miel",
      ar: "تشكيلة اللوز والعسل",
    },
    category: "desserts",
    priceMad: 45,
    recommendationIds: ["mint-tea"],
  },
];

export const DEMO_CATEGORY_ORDER: DemoCategory[] = ["signature", "mains", "drinks", "desserts"];

export function demoDish(id: string): DemoDish | undefined {
  return DEMO_MENU.find((d) => d.id === id);
}
