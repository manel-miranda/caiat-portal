/**
 * Minimal localisation layer.
 *
 * All user-facing copy lives in dictionaries keyed by language so that
 * French and Arabic can be added later by adding another dictionary and
 * switching `currentLang` (plus `dir` for Arabic). No component should
 * hardcode display strings.
 */

export type Lang = "en" | "fr" | "ar";

export const en = {
  appName: "Caiat",
  appSubtitle: "Operations",
  // auth
  signIn: "Sign in",
  usernameOrPhone: "Username or phone",
  pin: "PIN",
  enter: "Enter",
  signOut: "Sign out",
  invalidCredentials: "Wrong username or PIN",
  demoAccounts: "Demo accounts",
  // nav
  navRooms: "Rooms",
  navRequests: "Requests",
  navDashboard: "Dashboard",
  navCash: "Cash",
  navActivity: "Activity",
  // rooms / statuses
  room: "Room",
  available: "Available",
  occupied: "Occupied",
  arrivalToday: "Arrival today",
  departureToday: "Departure today",
  today: "Today",
  arrivals: "Arrivals",
  departures: "Departures",
  pendingRequests: "Pending requests",
  newStay: "New stay",
  // stay
  stay: "Stay",
  guest: "Guest",
  guestName: "Guest name",
  arrival: "Arrival",
  departure: "Departure",
  nights: "nights",
  guests: "Guests",
  source: "Source",
  accommodation: "Accommodation",
  accommodationTotal: "Accommodation total (MAD)",
  notes: "Notes",
  optional: "optional",
  bill: "Bill",
  total: "Total",
  paid: "Paid",
  outstanding: "Outstanding",
  addCharge: "Add charge",
  addRequest: "Add request",
  addPayment: "Add payment",
  checkout: "Checkout",
  createStay: "Create stay",
  save: "Save",
  cancel: "Cancel",
  // charges
  service: "Service",
  quantity: "Quantity",
  unitPrice: "Unit price (MAD)",
  chargeTotal: "Charge total",
  // requests
  request: "Request",
  requestType: "Type",
  when: "When",
  status: "Status",
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
  complete: "Complete",
  markCompleted: "Mark completed",
  addChargeQuestion: "Add the charge for this service?",
  yesAddCharge: "Yes, add charge",
  noJustComplete: "No, just complete",
  // payments
  payment: "Payment",
  amount: "Amount (MAD)",
  method: "Method",
  cash: "Cash",
  card: "Card",
  bankTransfer: "Bank transfer",
  receivedBy: "Received by",
  paymentRecorded: "Payment recorded",
  cashInSafe: "Cash goes to the safe",
  // checkout
  checkoutSummary: "Checkout summary",
  outstandingWarning: "This stay still has an outstanding balance.",
  recordPayment: "Record payment",
  confirmCheckout: "Confirm checkout",
  adminOverride: "Admin override: check out with balance",
  checkoutDone: "Stay closed, room available",
  // cash control
  cashControl: "Cash control",
  date: "Date",
  byEmployee: "Cash by employee",
  expectedInSafe: "Expected in safe",
  countedCash: "Counted cash (MAD)",
  difference: "Difference",
  saveCount: "Save cash count",
  discrepancy: "Discrepancy — please investigate",
  balanced: "Balanced",
  // dashboard
  occupancy: "Occupancy",
  guestsStaying: "Guests staying",
  revenueToday: "Revenue today",
  paymentsToday: "Payments today",
  outstandingBalances: "Outstanding balances",
  next24h: "Next 24 hours",
  scheduledRequests: "Scheduled requests",
  activity: "Activity",
  // misc
  noResults: "Nothing here yet",
  offline: "No connection — changes are paused",
  backOnline: "Back online",
  loading: "Loading…",
  by: "by",
} as const;

export type TranslationKey = keyof typeof en;

const dictionaries: Record<Lang, Partial<Record<TranslationKey, string>>> = {
  en,
  fr: {},
  ar: {},
};

export const currentLang: Lang = "en";

export function t(key: TranslationKey): string {
  return dictionaries[currentLang][key] ?? en[key];
}

export const sourceLabels: Record<string, string> = {
  booking_com: "Booking.com",
  whatsapp: "WhatsApp",
  phone: "Phone",
  email: "Email",
  walk_in: "Walk-in",
  other: "Other",
};

export const methodLabels: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  bank_transfer: "Bank transfer",
};
