export type Location = { id: string; folio: string; name: string; code: string };
export type Unit = { id: string; folio: string; name: string; symbol: string; allowDecimals: boolean };
export type Category = { id: string; folio: string; name: string };
export type Product = {
  id: string;
  folio: string;
  name: string;
  sku?: string | null;
  active: boolean;
  imageUrl?: string | null;
  categoryId: string;
  unitId: string;
  updatedAt: string;
  category: Category;
  unit: Unit;
  locations: Array<{ location: Location }>;
};
export type Dashboard = {
  pendingRequests: number;
  partialRequests: number;
  preparingTransfers: number;
  inRoute: number;
  pendingReceipts: number;
  openIncidents: number;
  resolvedIncidentsThisWeek: number;
  countsCompletedToday: number;
  accuracyRate: number;
  receivedLast30: number;
  receivedWithDifferencesLast30: number;
  activeCount: { id: string; total: number; completed: number } | null;
};
export type InventoryRow = {
  id: string;
  locationId: string;
  productId: string;
  quantity: string;
  updatedAt: string;
  location: Location;
  product: Product;
};
export type CountLine = {
  id: string;
  productId: string;
  snapshotQuantity: string;
  countedQuantity: string | null;
  countNotes?: string | null;
  status: "PENDING" | "COUNTED";
  version: number;
  product: Product;
};
export type StockCount = {
  id: string;
  folio: string;
  locationId: string;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  startedAt: string;
  location: Location;
  lines?: CountLine[];
  _count?: { lines: number };
};
export type SupplyRequest = {
  id: string;
  folio: string;
  status: string;
  createdAt: string;
  location: Location;
  lines: Array<{
    id: string;
    requestedQuantity: string;
    fulfilledQuantity: string;
    product: Product;
  }>;
};
export type Transfer = {
  id: string;
  folio: string;
  status: string;
  destinationLocationId: string;
  destination: Location;
  driver?: { id: string; name: string } | null;
  lines: Array<{
    id: string;
    sentQuantity: string;
    receivedQuantity?: string | null;
    product: Product;
  }>;
};
export type Incident = {
  id: string;
  folio: string;
  type: string;
  description: string;
  quantityDifference?: string | null;
  status: string;
  createdAt: string;
  location: Location;
  product?: Product | null;
};
