import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBox,
  IconBuildingStore,
  IconCheck,
  IconChecklist,
  IconCircleCheck,
  IconClipboardCheck,
  IconFileAnalytics,
  IconKey,
  IconMinus,
  IconPackageExport,
  IconPackageImport,
  IconPencil,
  IconPower,
  IconPlus,
  IconReceipt,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconStack2,
  IconTruck,
  IconUsers,
  IconX
} from "@tabler/icons-react";
import { api } from "./api";
import { Empty, Page, Skeleton, useApp } from "./App";
import { useRouter } from "./router";
import { listDrafts, removeDraft, saveDraft } from "./offline";
import { errorMessage, useToast } from "./toast";
import { Modal } from "./modal";
import type {
  Category,
  CountLine,
  Dashboard,
  Incident,
  InventoryRow,
  Location,
  Product,
  StockCount,
  SupplyRequest,
  Transfer,
  Unit
} from "./types";

const date = (value: string) =>
  new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const quantity = (value: string | number) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 }).format(Number(value));

const RECEPTION_TOLERANCE_KEY = "fatboy-reception-tolerance";
function getReceptionTolerance(): number {
  const stored = Number(localStorage.getItem(RECEPTION_TOLERANCE_KEY));
  return stored > 0 && stored <= 1 ? stored : 0.02;
}

function withLocation(path: string, locationId: string) {
  return `${path}${locationId ? `${path.includes("?") ? "&" : "?"}locationId=${locationId}` : ""}`;
}

function Status({ value }: { value: string }) {
  const className = /OPEN|DIFFERENCE|CANCEL|INACTIVE/i.test(value)
    ? "danger"
    : /PENDING|PARTIAL|PREPAR|ROUTE|ASSIGNED|PROGRESS|DELIVERED/i.test(value)
      ? "warning"
      : "success";
  return <span className={`badge ${className}`}>{value.replaceAll("_", " ")}</span>;
}

function AccuracyGauge({ rate }: { rate: number }) {
  const color = rate >= 95 ? "var(--success)" : rate >= 85 ? "var(--warning)" : "var(--danger)";
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (rate / 100) * circumference;
  return (
    <div className="accuracy-gauge">
      <svg viewBox="0 0 100 100" width="96" height="96">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--gray-100)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="accuracy-value">
        <strong>{rate}%</strong>
        <small>precisión</small>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { user, locationId } = useApp();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", locationId],
    queryFn: () => api.get<Dashboard>(withLocation("/dashboard", locationId))
  });
  const cards = [
    ["Solicitudes pendientes", data?.pendingRequests ?? 0, IconReceipt, "blue"],
    ["Surtidos por preparar", data?.preparingTransfers ?? 0, IconPackageExport, "orange"],
    ["En ruta", data?.inRoute ?? 0, IconTruck, "green"],
    ["Recepciones pendientes", data?.pendingReceipts ?? 0, IconChecklist, "violet"],
    ["Incidencias abiertas", data?.openIncidents ?? 0, IconAlertTriangle, "red"]
  ] as const;

  const weekly = [
    ["Conteos completados hoy", data?.countsCompletedToday ?? 0, IconClipboardCheck],
    ["Solicitudes parciales", data?.partialRequests ?? 0, IconReceipt],
    ["Incidencias resueltas (7 días)", data?.resolvedIncidentsThisWeek ?? 0, IconCircleCheck],
    ["Surtidos recibidos (7 días)", data?.receivedLast30 ?? 0, IconTruck]
  ] as const;

  return (
    <Page icon={<IconBuildingStore />} title={`Hola, ${user.name.split(" ")[0]}`} subtitle="Esto requiere atención hoy.">
      <section className="kpi-grid stagger">
        {cards.map(([label, value, Icon, color]) => (
          <article className="kpi-card" key={label}>
            <span className={`kpi-icon ${color}`}><Icon size={25} /></span>
            <div><span>{label}</span><strong>{isLoading ? "—" : value}</strong></div>
          </article>
        ))}
      </section>

      <section className="dashboard-secondary">
        <div className="panel accuracy-panel">
          <div>
            <span className="eyebrow">PRECISIÓN DE SURTIDOS</span>
            <h2>Últimos 7 días</h2>
            <p className="muted">
              {data?.receivedWithDifferencesLast30 ?? 0} de {data?.receivedLast30 ?? 0} surtidos con diferencias.
            </p>
          </div>
          <AccuracyGauge rate={data?.accuracyRate ?? 100} />
        </div>

        <div className="panel weekly-summary">
          <span className="eyebrow">RESUMEN OPERATIVO</span>
          <div className="weekly-grid">
            {weekly.map(([label, value, Icon]) => (
              <div className="weekly-item" key={label}>
                <Icon size={18} />
                <div>
                  <strong>{isLoading ? "—" : value}</strong>
                  <span>{label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel attention-panel">
        <div>
          <span className="eyebrow">ACCIÓN RÁPIDA</span>
          <h2>{data?.activeCount ? "Continúa el conteo de inventario" : "Operación al día"}</h2>
          <p>
            {data?.activeCount
              ? `${data.activeCount.completed} de ${data.activeCount.total} productos capturados.`
              : "Inicia un conteo o registra una nueva solicitud cuando lo necesites."}
          </p>
        </div>
        {data?.activeCount && <a className="button primary" href={`/conteos/${data.activeCount.id}`}>Continuar conteo</a>}
      </section>
    </Page>
  );
}

export function ProductsPage() {
  const client = useQueryClient();
  const toast = useToast();
  const { user } = useApp();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [activeFilter, setActiveFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<Product[]>("/products")
  });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: () => api.get<Unit[]>("/units") });
  const create = useMutation({
    mutationFn: async ({ body, image }: { body: object; image?: File }) => {
      const product = editing
        ? await api.patch<Product>(`/products/${editing.id}`, body)
        : await api.post<Product>("/products", body);
      if (!editing) setEditing(product);
      return image ? api.upload<Product>(`/products/${product.id}/image`, image) : product;
    },
    onSuccess: (product) => {
      void client.invalidateQueries({ queryKey: ["products"] });
      toast.success({
        title: editing ? "Producto actualizado" : "Producto creado",
        detail: product.name
      });
      setShowForm(false);
      setEditing(null);
    },
    onError: (cause) => toast.error({ title: "No se pudo guardar", detail: errorMessage(cause) })
  });
  const changeActive = useMutation({
    mutationFn: (product: Product) =>
      api.post(`/products/${product.id}/${product.active ? "deactivate" : "activate"}`),
    onSuccess: (_result, product) => {
      void client.invalidateQueries({ queryKey: ["products"] });
      toast.info({
        title: product.active ? "Producto desactivado" : "Producto activado",
        detail: product.name
      });
    },
    onError: (cause) => toast.error({ title: "No se pudo cambiar el estatus", detail: errorMessage(cause) })
  });
  // Se busca por nombre, folio o SKU: cualquiera de los tres identifica al producto.
  const term = search.trim().toLocaleLowerCase("es-MX");
  const visible = products.filter((product) =>
    [product.name, product.folio, product.sku ?? ""].some((field) =>
      field.toLocaleLowerCase("es-MX").includes(term)
    ) &&
    (!categoryId || product.categoryId === categoryId) &&
    (!unitId || product.unitId === unitId) &&
    (!activeFilter || String(product.active) === activeFilter)
  );
  const canEdit = ["SYSTEM_OWNER", "ADMIN"].includes(user.role);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const image = form.get("image");
    create.mutate({
      body: {
        name: String(form.get("name")),
        sku: String(form.get("sku") || "") || null,
        categoryId: String(form.get("categoryId")),
        unitId: String(form.get("unitId")),
        active: editing?.active ?? true,
        sortOrder: 0
      },
      image: image instanceof File && image.size ? image : undefined
    });
  }

  return (
    <Page
      icon={<IconBox />}
      title="Productos"
      subtitle="Catálogo de productos del sistema"
      action={canEdit && <button className="button primary" onClick={() => { setEditing(null); setShowForm(true); }}><IconPlus size={19} />Nuevo producto</button>}
    >
      <section className="panel filters product-filters">
        <label className="search"><IconSearch size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, folio o SKU…" /></label>
        <label><span>Categoría</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Todas</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Unidad</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="">Todas</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Estatus</span><select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></label>
        <button className="button ghost" onClick={() => { setSearch(""); setCategoryId(""); setUnitId(""); setActiveFilter(""); }}><IconRefresh size={18} />Limpiar</button>
      </section>
      <section className="panel data-panel scroll-panel">
        {isLoading ? <Skeleton rows={7} /> : visible.length ? (
          <>
            <div className="table products-table">
              <div className="table-head"><span>Producto</span><span>Categoría</span><span>Unidad</span><span>Estatus</span><span>Actualización</span><span>Acciones</span></div>
              {visible.map((product) => (
                <div className="table-row" key={product.id}>
                  <span className="product-cell"><span className="product-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <IconBox size={22} />}</span><span><strong>{product.name}</strong><small><span className="folio">{product.folio}</span>{product.sku ? ` · ${product.sku}` : ""}</small></span></span>
                  <span><span className="category-pill">{product.category.name}</span></span>
                  <span>{product.unit.symbol}</span>
                  <span><Status value={product.active ? "Activo" : "Inactivo"} /></span>
                  <span className="updated-cell"><strong>{new Intl.DateTimeFormat("es-MX").format(new Date(product.updatedAt))}</strong><small>{new Intl.DateTimeFormat("es-MX", { timeStyle: "short" }).format(new Date(product.updatedAt))}</small></span>
                  <span className="row-actions">{canEdit && <><button aria-label={`Editar ${product.name}`} onClick={() => { setEditing(product); setShowForm(true); }}><IconPencil size={17} /></button><button aria-label={`${product.active ? "Desactivar" : "Activar"} ${product.name}`} onClick={() => changeActive.mutate(product)}><IconPower size={17} /></button></>}</span>
                </div>
              ))}
            </div>
            <div className="mobile-list">
              {visible.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onEdit={canEdit ? () => { setEditing(product); setShowForm(true); } : undefined}
                  onToggle={canEdit ? () => changeActive.mutate(product) : undefined}
                />
              ))}
            </div>
          </>
        ) : <Empty>No hay productos que coincidan.</Empty>}
      </section>
      {showForm && (
        <Modal
          key={editing?.id ?? "new"}
          title={editing ? "Editar producto" : "Nuevo producto"}
          description={editing ? "Actualiza la información operativa." : "Agrega un producto al catálogo maestro."}
          onClose={() => setShowForm(false)}
          onSubmit={submit}
          actions={
            <>
              <button type="button" className="button ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="button primary" disabled={create.isPending}>
                {create.isPending ? "Guardando…" : "Guardar producto"}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label>Nombre<input name="name" required minLength={2} autoFocus defaultValue={editing?.name} /></label>
            <label>SKU <span className="optional">opcional</span><input name="sku" defaultValue={editing?.sku ?? ""} /></label>
            <label>Categoría<select name="categoryId" required defaultValue={editing?.categoryId ?? ""}><option value="">Selecciona</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Unidad<select name="unitId" required defaultValue={editing?.unitId ?? ""}><option value="">Selecciona</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          </div>
          <label className="full">
            Imagen <span className="optional">opcional</span>
            <input name="image" type="file" accept="image/jpeg,image/png,image/webp" />
            <small>JPG, PNG o WebP · máx. 5 MB.{editing?.imageUrl ? " Vacío conserva la actual." : ""}</small>
          </label>
          {create.error && <div className="form-error">{create.error.message}</div>}
        </Modal>
      )}
    </Page>
  );
}

function ProductCard({
  product,
  onEdit,
  onToggle
}: {
  product: Product;
  onEdit?: () => void;
  onToggle?: () => void;
}) {
  return (
    <article className="mobile-card">
      <div className="mobile-card-main">
        <span className="product-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <IconBox size={22} />}</span>
        <span><strong>{product.name}</strong><small><span className="folio">{product.folio}</span> · {product.category.name} · {product.unit.symbol}</small></span>
      </div>
      <div className="mobile-card-actions">
        <Status value={product.active ? "Activo" : "Inactivo"} />
        {onEdit && onToggle && (
          <span className="row-actions">
            <button aria-label={`Editar ${product.name}`} onClick={onEdit}><IconPencil size={17} /></button>
            <button aria-label={`${product.active ? "Desactivar" : "Activar"} ${product.name}`} onClick={onToggle}><IconPower size={17} /></button>
          </span>
        )}
      </div>
    </article>
  );
}

function Kpi({ label, value, icon, color }: { label: string; value: number; icon: ReactNode; color: string }) {
  return <article className="kpi-card"><span className={`kpi-icon ${color}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong></div></article>;
}

export function InventoryPage() {
  const { locationId } = useApp();
  const [search, setSearch] = useState("");
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inventory", locationId],
    queryFn: () => api.get<InventoryRow[]>(withLocation("/inventory", locationId))
  });
  const visible = rows.filter((row) => row.product.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <Page icon={<IconStack2 />} title="Stock actual" subtitle="Existencias confirmadas por el servidor">
      <section className="panel filters"><label className="search"><IconSearch size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" /></label></section>
      <section className="panel data-panel">
        {isLoading ? <Skeleton rows={6} variant="card" /> : visible.length ? (
          <div className="stock-grid">
            {visible.map((row) => <article className="stock-card" key={row.id}><div><strong>{row.product.name}</strong><small>{row.location.name} · {row.product.category.name}</small></div><span className="stock-quantity">{quantity(row.quantity)} <small>{row.product.unit.symbol}</small></span><small>Actualizado {date(row.updatedAt)}</small></article>)}
          </div>
        ) : <Empty>No hay productos en el catálogo.</Empty>}
      </section>
    </Page>
  );
}

/**
 * Captura táctil de cantidades: los botones cubren el uso normal (piso, celular
 * en mano) y el campo sigue abierto para teclear una cantidad grande o decimal.
 */
function Stepper({
  value,
  onChange,
  onCommit,
  allowDecimals = false,
  label,
  min = 0
}: {
  value: string;
  onChange: (next: string) => void;
  onCommit?: (next: string) => void;
  allowDecimals?: boolean;
  label: string;
  min?: number;
}) {
  const step = allowDecimals ? 0.5 : 1;

  function bump(direction: 1 | -1) {
    const current = Number(value === "" ? 0 : value);
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(min, Number((base + direction * step).toFixed(allowDecimals ? 2 : 0)));
    const text = String(next);
    onChange(text);
    onCommit?.(text);
  }

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-button minus"
        aria-label={`Restar a ${label}`}
        disabled={Number(value === "" ? 0 : value) <= min}
        onClick={() => bump(-1)}
      >
        <IconMinus size={20} />
      </button>
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={allowDecimals ? "0.01" : "1"}
        placeholder="0"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit?.(event.target.value)}
      />
      <button
        type="button"
        className="stepper-button plus"
        aria-label={`Sumar a ${label}`}
        onClick={() => bump(1)}
      >
        <IconPlus size={20} />
      </button>
    </div>
  );
}

/** Alta de mercancía comprada: entra al stock de una sucursal y desde ahí puede surtirse. */
export function PurchasesPage() {
  const { locationId, locations } = useApp();
  const client = useQueryClient();
  const toast = useToast();
  const [destination, setDestination] = useState(locationId);
  const [supplier, setSupplier] = useState("");
  const [search, setSearch] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => api.get<Product[]>("/products")
  });
  const lines = Object.entries(amounts).filter(([, value]) => Number(value) > 0);
  const register = useMutation({
    mutationFn: () =>
      api.post(
        "/inventory/purchases",
        {
          locationId: destination,
          supplier: supplier.trim() || undefined,
          lines: lines.map(([productId, quantity]) => ({ productId, quantity }))
        },
        crypto.randomUUID()
      ),
    onSuccess: () => {
      const total = lines.length;
      setAmounts({});
      setSupplier("");
      void client.invalidateQueries({ queryKey: ["inventory"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success({
        title: "Entrada registrada",
        detail: `${total} productos se sumaron al stock de la sucursal.`
      });
    },
    onError: (cause) => toast.error({ title: "No se pudo registrar", detail: errorMessage(cause) })
  });
  const visible = products.filter(
    (product) => product.active && product.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Page
      icon={<IconPackageImport />}
      title="Entradas"
      subtitle="Mercancía comprada que ingresa a una sucursal"
    >
      <section className="panel filters">
        <label>
          <span>Sucursal que recibe</span>
          <select value={destination} onChange={(event) => setDestination(event.target.value)}>
            <option value="">Selecciona</option>
            {locations.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Proveedor / factura</span>
          <input value={supplier} onChange={(event) => setSupplier(event.target.value)} placeholder="Opcional" />
        </label>
        <label className="search">
          <IconSearch size={19} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto…" />
        </label>
      </section>
      <section className="panel request-builder">
        {isLoading ? <Skeleton rows={6} /> : visible.length ? (
          visible.map((product) => (
            <div className="request-line" key={product.id}>
              <span><strong>{product.name}</strong><small>{product.unit.symbol}</small></span>
              <Stepper
                label={`Cantidad de ${product.name}`}
                value={amounts[product.id] ?? ""}
                allowDecimals={product.unit.allowDecimals}
                onChange={(next) => setAmounts({ ...amounts, [product.id]: next })}
              />
            </div>
          ))
        ) : <Empty>No hay productos que coincidan.</Empty>}
        <div className="sticky-submit">
          <button
            className="button primary"
            disabled={!destination || !lines.length || register.isPending}
            onClick={() => register.mutate()}
          >
            {register.isPending ? "Registrando…" : `Registrar entrada (${lines.length})`}
          </button>
        </div>
      </section>
    </Page>
  );
}

export function CountsPage() {
  const { locationId } = useApp();
  const client = useQueryClient();
  const toast = useToast();
  const { navigate } = useRouter();
  const { data: counts = [] } = useQuery({
    queryKey: ["counts", locationId],
    queryFn: () => api.get<StockCount[]>(withLocation("/counts", locationId))
  });
  const start = useMutation({
    mutationFn: () => api.post<StockCount>("/counts", { locationId }),
    onSuccess: (count) => {
      void client.invalidateQueries({ queryKey: ["counts"] });
      toast.info({
        title: "Conteo iniciado",
        detail: `${count.location?.name ?? "Sucursal"} · captura producto por producto, se guarda solo.`
      });
      navigate(`/conteos/${count.id}`);
    },
    onError: (cause) => toast.error({ title: "No se pudo iniciar el conteo", detail: errorMessage(cause) })
  });
  const active = counts.find((count) => count.status === "IN_PROGRESS");
  return (
    <Page icon={<IconClipboardCheck />} title="Conteos" subtitle="Captura física sin mostrar el stock registrado" action={!active && <button className="button primary" disabled={!locationId || start.isPending} onClick={() => start.mutate()}><IconPlus size={19} />Nuevo conteo</button>}>
      {start.error && <div className="form-error">{start.error.message}</div>}
      {active && <section className="panel active-count"><div><span className="eyebrow">CONTEO EN PROGRESO</span><h2>{active.location.name}</h2><p>Continúa donde te quedaste. Los cambios se guardan producto por producto.</p></div><button className="button primary" onClick={() => navigate(`/conteos/${active.id}`)}>Continuar</button></section>}
      <section className="panel data-panel">
        <h2>Historial</h2>
        {counts.length ? counts.map((count) => <article className="list-row" key={count.id}><div><strong>{count.location.name}</strong><small><span className="folio">{count.folio}</span> · {date(count.startedAt)} · {count._count?.lines ?? 0} productos</small></div><Status value={count.status} /></article>) : <Empty>No hay conteos registrados.</Empty>}
      </section>
    </Page>
  );
}

export function CountCapturePage() {
  const { path, navigate } = useRouter();
  const id = path.split("/")[2] ?? "";
  const client = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "COUNTED">("ALL");
  const [pendingOffline, setPendingOffline] = useState(0);
  const [showValidation, setShowValidation] = useState(false);
  const { data: count } = useQuery({
    queryKey: ["count", id],
    queryFn: () => api.get<StockCount>(`/counts/${id}`)
  });
  const { data: validation } = useQuery({
    queryKey: ["count-validation", id],
    queryFn: () => api.get<any>(`/counts/${id}/validate`),
    enabled: showValidation
  });

  async function syncDrafts() {
    if (!navigator.onLine) return;
    const drafts = (await listDrafts()).filter((draft) => draft.countId === id);
    for (const draft of drafts) {
      try {
        await api.patch(`/counts/${id}/lines/${draft.lineId}`, draft);
        await removeDraft(draft.id);
      } catch {
        break;
      }
    }
    const remaining = (await listDrafts()).filter((draft) => draft.countId === id);
    setPendingOffline(remaining.length);
    if (drafts.length && !remaining.length) {
      toast.success({ title: "Sincronizado", detail: `${drafts.length} capturas pendientes se subieron al servidor.` });
    }
    await client.invalidateQueries({ queryKey: ["count", id] });
  }

  useEffect(() => {
    void listDrafts().then((drafts) => setPendingOffline(drafts.filter((draft) => draft.countId === id).length));
    window.addEventListener("online", syncDrafts);
    return () => window.removeEventListener("online", syncDrafts);
  }, [id]);

  const complete = useMutation({
    mutationFn: () => api.post(`/counts/${id}/complete`, undefined, crypto.randomUUID()),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["counts"] });
      void client.invalidateQueries({ queryKey: ["inventory"] });
      toast.success({ title: "Conteo confirmado", detail: "El stock quedó actualizado con lo capturado." });
      navigate("/conteos");
    },
    onError: (cause) => toast.error({ title: "No se pudo confirmar", detail: errorMessage(cause) })
  });

  if (!count?.lines) return <Skeleton rows={6} />;
  const captured = count.lines.filter((line) => line.status === "COUNTED").length;
  const filtered = count.lines.filter((line) => filter === "ALL" || line.status === filter);
  const progress = Math.round((captured / count.lines.length) * 100);
  const allCaptured = captured === count.lines.length;

  return (
    <Page icon={<IconClipboardCheck />} title="Conteo de inventario" subtitle={count.location.name}>
      <section className="count-summary">
        <div><strong>{captured} de {count.lines.length}</strong><span>{progress}%</span></div>
        <div className="progress"><i style={{ width: `${progress}%` }} /></div>
        <div className={`sync-state ${pendingOffline ? "offline" : ""}`}>{pendingOffline ? `Sin conexión · ${pendingOffline} cambios pendientes` : "Cambios sincronizados"}</div>
      </section>
      <div className="tabs">
        {(["ALL", "PENDING", "COUNTED"] as const).map((value) => <button className={filter === value ? "active" : ""} onClick={() => setFilter(value)} key={value}>{value === "ALL" ? "Todos" : value === "PENDING" ? "Pendientes" : "Capturados"}</button>)}
      </div>
      <section className="count-list">
        {filtered.map((line) => <CountInput key={line.id} countId={id} line={line} onSaved={() => void client.invalidateQueries({ queryKey: ["count", id] })} onQueued={() => setPendingOffline((value) => value + 1)} />)}
      </section>
      <div className="bottom-action">
        <div><strong>{allCaptured ? "Conteo listo para revisar" : `${count.lines.length - captured} productos pendientes`}</strong><small>La confirmación requiere conexión.</small></div>
        <button className="button primary" disabled={!allCaptured || pendingOffline > 0 || !navigator.onLine} onClick={() => setShowValidation(true)}>Confirmar conteo</button>
      </div>
      {showValidation && validation && (
        <Modal
          title={validation.valid ? "Resumen del conteo" : "Errores detectados"}
          description={
            validation.valid
              ? `${validation.adjustments.length} producto(s) ajustarán su stock al confirmar.`
              : "Corrige lo siguiente antes de confirmar."
          }
          size="wide"
          onClose={() => setShowValidation(false)}
          actions={
            <>
              <button className="button ghost" onClick={() => setShowValidation(false)}>Cancelar</button>
              <button
                className="button primary"
                disabled={!validation.valid || complete.isPending}
                onClick={() => complete.mutate()}
              >
                {complete.isPending ? "Procesando…" : "Confirmar conteo"}
              </button>
            </>
          }
        >
          {!validation.valid && validation.issues.length > 0 && (
            <div className="form-error">{validation.issues.map((issue: string) => <div key={issue}>{issue}</div>)}</div>
          )}
          {validation.adjustments.length > 0 ? (
            <div className="table-scroll">
              <table className="adjustments-table">
                <thead><tr><th>Producto</th><th>Diferencia</th><th>Stock nuevo</th></tr></thead>
                <tbody>
                  {validation.adjustments.map((adj: any) => (
                    <tr key={adj.productId}>
                      <td>{adj.productName}</td>
                      <td className={adj.delta.startsWith("-") ? "negative" : "positive"}>{adj.delta}</td>
                      <td>{quantity(adj.newBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : validation.valid ? (
            <p className="muted">El conteo coincide con el stock registrado. No hay ajustes que aplicar.</p>
          ) : null}
          {complete.error && <div className="form-error">{complete.error.message}</div>}
        </Modal>
      )}
    </Page>
  );
}

function CountInput({ countId, line, onSaved, onQueued }: { countId: string; line: CountLine; onSaved: () => void; onQueued: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(line.countedQuantity ?? "");
  const [notes, setNotes] = useState(line.countNotes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "queued">("idle");
  // La versión viaja en cada guardado; la mantenemos al día localmente para que
  // varios toques seguidos no choquen entre sí.
  const version = useRef(line.version);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    version.current = line.version;
  }, [line.version]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** Agrupa los toques rápidos en un solo guardado. */
  function scheduleSave(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next), 600);
  }

  async function save(override?: string) {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const quantityToSave = override ?? value;
    if (quantityToSave === "") return;
    const draft = {
      id: `${countId}:${line.id}`,
      countId,
      lineId: line.id,
      countedQuantity: quantityToSave,
      notes: notes || undefined,
      version: version.current,
      clientMutationId: crypto.randomUUID(),
      createdAt: Date.now()
    };
    setState("saving");
    try {
      const saved = await api.patch<CountLine>(`/counts/${countId}/lines/${line.id}`, draft);
      if (saved?.version !== undefined) version.current = saved.version;
      await removeDraft(draft.id);
      setState("saved");
      onSaved();
    } catch (error) {
      if (navigator.onLine) {
        setState("idle");
        toast.error({ title: `No se guardó ${line.product.name}`, detail: errorMessage(error) });
        return;
      }
      // Sin señal el dato no se pierde: queda en cola y se sube al reconectar.
      await saveDraft(draft);
      setState("queued");
      onQueued();
      toast.warning({
        title: "Guardado sin conexión",
        detail: `${line.product.name} se sincronizará al recuperar la señal.`
      });
    }
  }

  const delta = line.countedQuantity ? Number(line.countedQuantity) - Number(line.snapshotQuantity) : null;
  const deltaClass = delta === null ? "" : delta === 0 ? "neutral" : delta > 0 ? "positive" : "negative";

  return (
    <article className="count-row">
      <div>
        <strong>{line.product.name}</strong>
        <small>Esperado: {quantity(line.snapshotQuantity)} {line.product.unit.symbol}</small>
      </div>
      <div className="count-input-group">
        <Stepper
          label={`Cantidad de ${line.product.name}`}
          value={value}
          allowDecimals={line.product.unit.allowDecimals}
          onChange={setValue}
          onCommit={(next) => {
            setValue(next);
            scheduleSave(next);
          }}
        />
        {delta !== null && <span className={`delta ${deltaClass}`}>{delta > 0 ? "+" : ""}{quantity(delta)}</span>}
      </div>
      {notes && <small className="count-notes">{notes}</small>}
      <span className={`save-indicator ${state}`}>{state === "saving" ? "Guardando…" : state === "queued" ? "Pendiente" : value !== "" ? <><IconCircleCheck size={18} />Guardado</> : "Pendiente"}</span>
    </article>
  );
}

export function RequestsPage() {
  const { user, locationId } = useApp();
  const client = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const { data: requests = [] } = useQuery({ queryKey: ["requests", locationId], queryFn: () => api.get<SupplyRequest[]>(withLocation("/requests", locationId)) });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api.get<Product[]>("/products") });
  const create = useMutation({
    mutationFn: async () => {
      const request = await api.post<{ id: string }>("/requests", {
        locationId,
        lines: Object.entries(amounts).filter(([, value]) => Number(value) > 0).map(([productId, value]) => ({ productId, quantity: value }))
      });
      return api.post(`/requests/${request.id}/submit`);
    },
    onSuccess: () => {
      const total = Object.values(amounts).filter((value) => Number(value) > 0).length;
      setCreating(false);
      setAmounts({});
      void client.invalidateQueries({ queryKey: ["requests"] });
      toast.success({ title: "Solicitud enviada", detail: `${total} productos quedaron en espera de surtido.` });
    },
    onError: (cause) => toast.error({ title: "No se pudo enviar", detail: errorMessage(cause) })
  });
  const createTransfer = useMutation({
    mutationFn: (request: SupplyRequest) =>
      api.post("/transfers", {
        destinationLocationId: request.location.id,
        lines: request.lines
          .map((line) => ({
            productId: line.product.id,
            supplyRequestLineId: line.id,
            sentQuantity: String(
              Math.max(0, Number(line.requestedQuantity) - Number(line.fulfilledQuantity))
            )
          }))
          .filter((line) => Number(line.sentQuantity) > 0)
      }),
    onSuccess: (_result, request) => {
      void client.invalidateQueries({ queryKey: ["transfers"] });
      void client.invalidateQueries({ queryKey: ["requests"] });
      toast.success({
        title: "Surtido creado",
        detail: `Ya puedes asignarle repartidor desde Surtidos · ${request.location.name}.`
      });
    },
    onError: (cause) => toast.error({ title: "No se pudo crear el surtido", detail: errorMessage(cause) })
  });
  return (
    <Page icon={<IconReceipt />} title="Solicitudes" subtitle="Productos requeridos por la sucursal" action={<button className="button primary" onClick={() => setCreating(true)}><IconPlus size={19} />Nueva solicitud</button>}>
      {creating && <section className="panel request-builder"><div className="section-heading"><div><h2>Nueva solicitud</h2><p>Captura únicamente lo que necesita la sucursal.</p></div><button className="icon-button" onClick={() => setCreating(false)}><IconX /></button></div>{products.map((product) => <div className="request-line" key={product.id}><span><strong>{product.name}</strong><small>{product.unit.symbol}</small></span><Stepper label={`Cantidad de ${product.name}`} value={amounts[product.id] ?? ""} allowDecimals={product.unit.allowDecimals} onChange={(next) => setAmounts({ ...amounts, [product.id]: next })} /></div>)}<div className="sticky-submit"><button className="button primary" disabled={!Object.values(amounts).some((value) => Number(value) > 0) || create.isPending} onClick={() => create.mutate()}>Enviar solicitud</button></div>{create.error && <div className="form-error">{create.error.message}</div>}</section>}
      <section className="panel data-panel">{requests.length ? requests.map((request) => <article className="list-row" key={request.id}><div><strong><span className="folio">{request.folio}</span></strong><small>{request.location.name} · {request.lines.length} productos · {date(request.createdAt)}</small></div><Status value={request.status} />{["SYSTEM_OWNER", "ADMIN"].includes(user.role) && ["PENDING", "PARTIAL"].includes(request.status) && <button className="button ghost" disabled={createTransfer.isPending} onClick={() => createTransfer.mutate(request)}>Crear surtido</button>}</article>) : <Empty>No hay solicitudes registradas.</Empty>}</section>
    </Page>
  );
}

function TransferTimeline({ status }: { status: string }) {
  const steps = ["PREPARING", "ASSIGNED", "IN_ROUTE", "DELIVERED", "RECEIVED"];
  const currentIndex = steps.indexOf(status);
  const isError = status.includes("CANCEL");
  return (
    <div className="timeline">
      {steps.map((step, idx) => (
        <div key={step} className={`timeline-step ${idx <= currentIndex && !isError ? "done" : ""} ${idx === currentIndex && !isError ? "active" : ""}`}>
          <div className="timeline-dot" />
          <span className="timeline-label">{step.replace(/_/g, " ")}</span>
        </div>
      ))}
    </div>
  );
}

export function TransfersPage({ driverMode = false }: { driverMode?: boolean }) {
  const { user, locationId, locations } = useApp();
  const client = useQueryClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [destination, setDestination] = useState(locationId);
  const [source, setSource] = useState(locationId);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const { data: transfers = [] } = useQuery({ queryKey: ["transfers", driverMode, locationId], queryFn: () => api.get<Transfer[]>(withLocation("/transfers", locationId)) });
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => api.get<Product[]>("/products") });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<UserRow[]>("/users"),
    enabled: ["SYSTEM_OWNER", "ADMIN"].includes(user.role)
  });
  const create = useMutation({
    mutationFn: () => api.post("/transfers", { sourceLocationId: source, destinationLocationId: destination, lines: Object.entries(amounts).filter(([, value]) => Number(value) > 0).map(([productId, sentQuantity]) => ({ productId, sentQuantity })) }),
    onSuccess: () => {
      setCreating(false);
      setAmounts({});
      void client.invalidateQueries({ queryKey: ["transfers"] });
      toast.success({ title: "Surtido preparado", detail: "El siguiente paso es asignar un repartidor." });
    },
    onError: (cause) => toast.error({ title: "No se pudo preparar", detail: errorMessage(cause) })
  });
  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "start" | "deliver" }) => api.post(`/transfers/${id}/${action}`),
    onSuccess: (_result, { action }) => {
      void client.invalidateQueries({ queryKey: ["transfers"] });
      toast.success(
        action === "start"
          ? { title: "Reparto iniciado", detail: "El surtido aparece como En ruta para la sucursal." }
          : { title: "Entrega marcada", detail: "La sucursal ya puede confirmar la recepción." }
      );
    },
    onError: (cause) => toast.error({ title: "No se pudo actualizar", detail: errorMessage(cause) })
  });
  const assign = useMutation({
    mutationFn: ({ id, driverUserId }: { id: string; driverUserId: string }) =>
      api.post(`/transfers/${id}/assign-driver`, { driverUserId }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["transfers"] });
      toast.success({ title: "Repartidor asignado", detail: "Verá la entrega en su lista al iniciar sesión." });
    },
    onError: (cause) => toast.error({ title: "No se pudo asignar", detail: errorMessage(cause) })
  });
  const isDriverView = driverMode || user.role === "DRIVER";
  return (
    <Page icon={isDriverView ? <IconTruck /> : <IconPackageExport />} title={isDriverView ? "Mis entregas" : "Surtidos"} subtitle={isDriverView ? "Entregas asignadas a tu usuario" : "Preparación y seguimiento de producto"} action={!driverMode && !["DRIVER", "MANAGER"].includes(user.role) && <button className="button primary" onClick={() => setCreating(true)}><IconPlus size={19} />Crear surtido</button>}>
      {creating && <section className="panel request-builder"><div className="section-heading"><div><h2>Nuevo surtido</h2><p>Selecciona origen y destino, luego agrega productos.</p></div><button className="icon-button" onClick={() => setCreating(false)}><IconX /></button></div><div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px"}}><label>Origen<select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Selecciona</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Destino<select value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Selecciona</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>{products.map((product) => <div className="request-line" key={product.id}><span><strong>{product.name}</strong><small>{product.unit.symbol}</small></span><Stepper label={`Cantidad de ${product.name}`} value={amounts[product.id] ?? ""} allowDecimals={product.unit.allowDecimals} onChange={(next) => setAmounts({ ...amounts, [product.id]: next })} /></div>)}<div className="sticky-submit"><button className="button primary" disabled={!source || !destination || !Object.values(amounts).some((value) => Number(value) > 0) || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Preparando..." : "Preparar surtido"}</button></div>{create.error && <div className="form-error">{typeof create.error.message === 'string' ? create.error.message : JSON.stringify(create.error.message)}</div>}</section>}
      <section className="delivery-grid">{transfers.length ? transfers.map((transfer) => <article className="delivery-card" key={transfer.id}><div className="delivery-heading"><div><span className="eyebrow">{transfer.destination.name}</span><h2><span className="folio">{transfer.folio}</span></h2></div><Status value={transfer.status} /></div><TransferTimeline status={transfer.status} /><ul>{transfer.lines.map((line) => <li key={line.id}><span>{line.product.name}</span><strong>{quantity(line.sentQuantity)} {line.product.unit.symbol}</strong></li>)}</ul>{transfer.driver && <p className="muted">🚗 {transfer.driver.name}</p>}{["SYSTEM_OWNER", "ADMIN"].includes(user.role) && transfer.status === "PREPARING" && <label className="driver-select">Asignar repartidor<select defaultValue="" onChange={(event) => event.target.value && assign.mutate({ id: transfer.id, driverUserId: event.target.value })}><option value="">Selecciona</option>{users.filter((item) => item.role === "DRIVER" && item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{user.role === "DRIVER" && transfer.status === "ASSIGNED" && <button className="button primary wide" onClick={() => transition.mutate({ id: transfer.id, action: "start" })}>Iniciar reparto</button>}{user.role === "DRIVER" && transfer.status === "IN_ROUTE" && <button className="button primary wide" onClick={() => transition.mutate({ id: transfer.id, action: "deliver" })}>Marcar entrega</button>}</article>) : <Empty>No hay entregas en esta vista.</Empty>}</section>
    </Page>
  );
}

export function ReceivingPage() {
  const { locationId } = useApp();
  const client = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<Transfer | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  const { data: transfers = [] } = useQuery({ queryKey: ["transfers", locationId], queryFn: () => api.get<Transfer[]>(withLocation("/transfers", locationId)) });
  const delivered = transfers.filter((transfer) => transfer.status === "DELIVERED");

  const receive = useMutation({
    mutationFn: () => api.post(`/transfers/${selected!.id}/receive`, { lines: selected!.lines.map((line) => ({ lineId: line.id, receivedQuantity: amounts[line.id] ?? line.sentQuantity })) }, crypto.randomUUID()),
    onSuccess: () => {
      const gaps = differences.length;
      setSelected(null);
      setAmounts({});
      setShowSummary(false);
      void client.invalidateQueries({ queryKey: ["transfers"] });
      void client.invalidateQueries({ queryKey: ["inventory"] });
      void client.invalidateQueries({ queryKey: ["incidents"] });
      if (gaps) {
        toast.warning({
          title: "Recepción con diferencias",
          detail: `Se registraron ${gaps} incidencia(s) para seguimiento.`
        });
      } else {
        toast.success({ title: "Recepción confirmada", detail: "Todo llegó completo. Stock actualizado." });
      }
    },
    onError: (cause) => toast.error({ title: "No se pudo confirmar", detail: errorMessage(cause) })
  });

  const getDifferenceClass = (sent: string, received: string) => {
    const s = Number(sent), r = Number(received);
    if (s === r) return "neutral";
    if (Math.abs(s - r) / s <= getReceptionTolerance()) return "warning";
    return "danger";
  };

  const calculateDifferences = () => {
    if (!selected) return [];
    return selected.lines
      .map((line) => {
        const received = Number(amounts[line.id] ?? line.sentQuantity);
        const sent = Number(line.sentQuantity);
        const diff = received - sent;
        return {
          productId: line.product.id,
          productName: line.product.name,
          sent,
          received,
          diff,
          hasDifference: diff !== 0
        };
      })
      .filter((item) => item.hasDifference);
  };

  const differences = calculateDifferences();

  return (
    <Page icon={<IconChecklist />} title="Recepciones" subtitle="Confirma únicamente lo recibido físicamente">
      {!selected ? (
        <section className="delivery-grid">
          {delivered.length ? (
            delivered.map((transfer) => (
              <article className="delivery-card" key={transfer.id}>
                <div className="delivery-heading">
                  <div>
                    <span className="eyebrow">{transfer.destination.name}</span>
                    <h2><span className="folio">{transfer.folio}</span></h2>
                  </div>
                  <Status value={transfer.status} />
                </div>
                <p>{transfer.lines.length} productos por recibir</p>
                <button
                  className="button primary wide"
                  onClick={() => {
                    setSelected(transfer);
                    setAmounts(Object.fromEntries(transfer.lines.map((line) => [line.id, line.sentQuantity])));
                    setShowSummary(false);
                  }}
                >
                  Recibir surtido
                </button>
              </article>
            ))
          ) : (
            <Empty>No hay surtidos pendientes de recepción.</Empty>
          )}
        </section>
      ) : (
        <section className="panel request-builder">
          <div className="section-heading">
            <div>
              <h2>Recibir surtido</h2>
              <p>{selected.destination.name} · {selected.folio}</p>
            </div>
            <button className="icon-button" onClick={() => setSelected(null)}>
              <IconX />
            </button>
          </div>
          {selected.lines.map((line) => {
            const sent = Number(line.sentQuantity);
            const received = Number(amounts[line.id] ?? line.sentQuantity);
            const diff = received - sent;
            const diffClass = getDifferenceClass(line.sentQuantity, amounts[line.id] ?? line.sentQuantity);
            return (
              <div className="reception-line" key={line.id}>
                <span>
                  <strong>{line.product.name}</strong>
                  <small>Enviado: {quantity(line.sentQuantity)} {line.product.unit.symbol}</small>
                </span>
                <span style={{ display: "grid", gap: "6px" }}>
                  Recibido
                  <Stepper
                    label={`Recibido de ${line.product.name}`}
                    value={amounts[line.id] ?? ""}
                    allowDecimals={line.product.unit.allowDecimals}
                    onChange={(next) => setAmounts({ ...amounts, [line.id]: next })}
                  />
                  {diff !== 0 && <span className={`delta ${diffClass}`}>{diff > 0 ? "+" : ""}{quantity(diff)}</span>}
                </span>
              </div>
            );
          })}
          {differences.length > 0 && (
            <div className="warning-box">
              <strong>⚠️ {differences.length} diferencia(s) detectada(s)</strong>
              <ul>
                {differences.map((d) => (
                  <li key={d.productId}>
                    {d.productName}: {d.diff > 0 ? "+" : ""}{d.diff} unidades
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="sticky-submit">
            <button
              className="button"
              onClick={() => setShowSummary(true)}
              disabled={Object.values(amounts).some((value) => value === "")}
            >
              Revisar y confirmar
            </button>
          </div>
          {receive.error && <div className="form-error">{receive.error.message}</div>}
        </section>
      )}
      {showSummary && selected && (
        <Modal
          title="Resumen de recepción"
          description={`${selected.destination.name} · ${selected.folio}`}
          onClose={() => setShowSummary(false)}
          actions={
            <>
              <button className="button ghost" onClick={() => setShowSummary(false)}>Editar</button>
              <button className="button primary" disabled={receive.isPending} onClick={() => receive.mutate()}>
                {receive.isPending ? "Procesando…" : "Confirmar recepción"}
              </button>
            </>
          }
        >
          {differences.length > 0 ? (
            <div className="warning-box">
              <strong>Se crearán {differences.length} incidencia(s)</strong>
              <ul>
                {differences.map((d) => (
                  <li key={d.productId}>
                    {d.productName}: {d.diff > 0 ? "exceso" : "falta"} de {Math.abs(d.diff)} unidades
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="confirm-note">
              <IconCircleCheck size={22} />
              <div>
                <strong>Recepción exacta</strong>
                <span>Todo coincide con lo enviado. El stock se actualiza al confirmar.</span>
              </div>
            </div>
          )}
        </Modal>
      )}
    </Page>
  );
}

export function IncidentsPage() {
  const { user, locationId } = useApp();
  const client = useQueryClient();
  const toast = useToast();
  const { data: incidents = [] } = useQuery({ queryKey: ["incidents", locationId], queryFn: () => api.get<Incident[]>(withLocation("/incidents", locationId)) });
  const resolve = useMutation({
    mutationFn: (id: string) => api.post(`/incidents/${id}/resolve`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["incidents"] });
      toast.success({ title: "Incidencia resuelta", detail: "Queda registrada en el historial." });
    },
    onError: (cause) => toast.error({ title: "No se pudo resolver", detail: errorMessage(cause) })
  });
  return (
    <Page icon={<IconAlertTriangle />} title="Incidencias" subtitle="Diferencias y daños que requieren seguimiento">
      <section className="panel data-panel">{incidents.length ? incidents.map((incident) => <article className="incident-row" key={incident.id}><span className="kpi-icon red"><IconAlertTriangle /></span><div><strong>{incident.product?.name || incident.type.replaceAll("_", " ")}</strong><small><span className="folio">{incident.folio}</span> · {incident.location.name} · {incident.description} · {date(incident.createdAt)}</small></div><Status value={incident.status} />{incident.status === "OPEN" && !["MANAGER", "DRIVER"].includes(user.role) && <button className="button ghost" onClick={() => resolve.mutate(incident.id)}>Resolver</button>}</article>) : <Empty>No hay incidencias registradas.</Empty>}</section>
    </Page>
  );
}

export function ReportsPage() {
  const { locationId } = useApp();
  const { data } = useQuery({ queryKey: ["report", locationId], queryFn: () => api.get<Dashboard>(withLocation("/reports/summary", locationId)) });
  return (
    <Page icon={<IconFileAnalytics />} title="Reportes" subtitle="Resumen operativo derivado del backend">
      <section className="kpi-grid stagger"><Kpi label="Solicitudes pendientes" value={data?.pendingRequests ?? 0} icon={<IconReceipt />} color="blue" /><Kpi label="En ruta" value={data?.inRoute ?? 0} icon={<IconTruck />} color="green" /><Kpi label="Recepciones pendientes" value={data?.pendingReceipts ?? 0} icon={<IconChecklist />} color="orange" /><Kpi label="Incidencias abiertas" value={data?.openIncidents ?? 0} icon={<IconAlertTriangle />} color="red" /></section>
      <section className="panel accuracy-panel">
        <div>
          <span className="eyebrow">PRECISIÓN DE SURTIDOS</span>
          <h2>Últimos 7 días</h2>
          <p className="muted">{data?.receivedWithDifferencesLast30 ?? 0} de {data?.receivedLast30 ?? 0} surtidos con diferencias · {data?.resolvedIncidentsThisWeek ?? 0} incidencias resueltas esta semana.</p>
        </div>
        <AccuracyGauge rate={data?.accuracyRate ?? 100} />
      </section>
    </Page>
  );
}

type UserRow = { id: string; folio: string; name: string; email: string; role: string; locationId?: string | null; active: boolean; lastLoginAt?: string | null };

const creatableRoles = ["ADMIN", "MANAGER", "DRIVER"] as const;

function roleLabelEs(role: string) {
  return (
    {
      SYSTEM_OWNER: "Propietario del sistema",
      ADMIN: "Administrador",
      MANAGER: "Encargado",
      DRIVER: "Repartidor"
    }[role] ?? role.replace("_", " ")
  );
}

export function UsersPage() {
  const { locations, user } = useApp();
  const client = useQueryClient();
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [role, setRole] = useState<string>("MANAGER");
  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing ? api.patch(`/users/${editing.id}`, body) : api.post("/users", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["users"] });
      toast.success({ title: editing ? "Usuario actualizado" : "Usuario creado" });
      setShowForm(false);
      setEditing(null);
    },
    onError: (cause) => toast.error({ title: "No se pudo guardar", detail: errorMessage(cause) })
  });

  const toggleActive = useMutation({
    mutationFn: (target: UserRow) => api.patch(`/users/${target.id}`, { active: !target.active }),
    onSuccess: (_result, target) => {
      void client.invalidateQueries({ queryKey: ["users"] });
      toast.info({ title: target.active ? "Acceso desactivado" : "Acceso activado", detail: target.name });
    },
    onError: (cause) => toast.error({ title: "No se pudo cambiar el acceso", detail: errorMessage(cause) })
  });

  const resetPassword = useMutation({
    mutationFn: (password: string) => api.post(`/users/${resetTarget!.id}/reset-password`, { password }),
    onSuccess: () => {
      toast.success({
        title: "Contraseña restablecida",
        detail: `${resetTarget?.name ?? "El usuario"} deberá entrar de nuevo.`
      });
      setResetTarget(null);
    },
    onError: (cause) => toast.error({ title: "No se pudo restablecer", detail: errorMessage(cause) })
  });

  function openCreate() {
    setEditing(null);
    setRole("MANAGER");
    setShowForm(true);
  }
  function openEdit(target: UserRow) {
    setEditing(target);
    setRole(target.role);
    setShowForm(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const locationId = role === "MANAGER" ? String(form.get("locationId") || "") || null : null;
    if (editing) {
      save.mutate(editing.role === "SYSTEM_OWNER"
        ? { name: String(form.get("name")), email: String(form.get("email")) }
        : { name: String(form.get("name")), email: String(form.get("email")), role, locationId });
    } else {
      save.mutate({
        name: String(form.get("name")),
        email: String(form.get("email")),
        password: String(form.get("password")),
        role,
        locationId
      });
    }
  }

  return (
    <Page
      icon={<IconUsers />}
      title="Usuarios"
      subtitle="Accesos y roles del sistema"
      action={<button className="button primary" onClick={openCreate}><IconPlus size={19} />Nuevo usuario</button>}
    >
      <section className="panel data-panel">
        {users.length ? users.map((item) => (
          <article className="list-row" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <small>
                <span className="folio">{item.folio}</span> · {item.email} · {roleLabelEs(item.role)}
                {item.locationId ? ` · ${locations.find((location) => location.id === item.locationId)?.name ?? ""}` : ""}
              </small>
            </div>
            <Status value={item.active ? "Activo" : "Inactivo"} />
            <span className="row-actions">
              {(item.role !== "SYSTEM_OWNER" || item.id === user.id) && (
                <button aria-label={`Editar ${item.name}`} onClick={() => openEdit(item)}><IconPencil size={17} /></button>
              )}
              {item.role !== "SYSTEM_OWNER" && (
                <>
                <button aria-label={`Restablecer contraseña de ${item.name}`} onClick={() => setResetTarget(item)}><IconKey size={17} /></button>
                <button aria-label={`${item.active ? "Desactivar" : "Activar"} ${item.name}`} onClick={() => toggleActive.mutate(item)}><IconPower size={17} /></button>
                </>
              )}
            </span>
          </article>
        )) : <Empty>No hay usuarios visibles.</Empty>}
      </section>

      {showForm && (
        <Modal
          key={editing?.id ?? "new"}
          title={editing ? "Editar usuario" : "Nuevo usuario"}
          description={editing ? "Actualiza rol y sucursal." : "Crea un acceso con su rol."}
          onClose={() => setShowForm(false)}
          onSubmit={submit}
          actions={
            <>
              <button type="button" className="button ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="button primary" disabled={save.isPending}>
                {save.isPending ? "Guardando…" : editing ? "Guardar cambios" : "Crear usuario"}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label>Nombre<input name="name" required minLength={2} autoFocus defaultValue={editing?.name} /></label>
            <label>Correo<input name="email" type="email" required defaultValue={editing?.email} /></label>
            {!editing && (
              <label>
                Contraseña
                <input name="password" type="password" required minLength={12} />
                <small>Mínimo 12 caracteres.</small>
              </label>
            )}
            {editing?.role !== "SYSTEM_OWNER" && (
              <label>
                Rol
                <select name="role" required value={role} onChange={(event) => setRole(event.target.value)}>
                  {creatableRoles.map((item) => <option key={item} value={item}>{roleLabelEs(item)}</option>)}
                </select>
              </label>
            )}
            {editing?.role !== "SYSTEM_OWNER" && role === "MANAGER" && (
              <label>
                Sucursal
                <select name="locationId" required defaultValue={editing?.locationId ?? ""}>
                  <option value="">Selecciona</option>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </label>
            )}
          </div>
          {save.error && <div className="form-error">{save.error.message}</div>}
        </Modal>
      )}

      {resetTarget && (
        <Modal
          title="Restablecer contraseña"
          description={resetTarget.name}
          onClose={() => setResetTarget(null)}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            resetPassword.mutate(String(form.get("password")));
          }}
          actions={
            <>
              <button type="button" className="button ghost" onClick={() => setResetTarget(null)}>Cancelar</button>
              <button className="button primary" disabled={resetPassword.isPending}>
                {resetPassword.isPending ? "Restableciendo…" : "Restablecer"}
              </button>
            </>
          }
        >
          <label className="full">
            Nueva contraseña
            <input name="password" type="password" required minLength={12} autoFocus />
            <small>Mínimo 12 caracteres. Se cerrará su sesión activa.</small>
          </label>
          {resetPassword.error && <div className="form-error">{resetPassword.error.message}</div>}
        </Modal>
      )}
    </Page>
  );
}

type Audit = { id: string; action: string; entityType: string; entityId: string; createdAt: string; user: { name: string } };
export function AuditPage() {
  const { data: logs = [] } = useQuery({ queryKey: ["audit"], queryFn: () => api.get<Audit[]>("/audit") });
  return <Page icon={<IconChecklist />} title="Auditoría" subtitle="Acciones administrativas inmutables"><section className="panel data-panel">{logs.map((log) => <article className="list-row" key={log.id}><div><strong>{log.action} · {log.entityType}</strong><small>{log.user.name} · {date(log.createdAt)} · #{log.entityId.slice(-6)}</small></div></article>)}</section></Page>;
}

export function CatalogPage() {
  const { user, locations } = useApp();
  const client = useQueryClient();
  const toast = useToast();
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: () => api.get<Unit[]>("/units") });
  const canEdit = ["SYSTEM_OWNER", "ADMIN"].includes(user.role);

  const saveLocation = useMutation({
    mutationFn: (body: { name: string; code: string }) =>
      editingLocation ? api.patch(`/locations/${editingLocation.id}`, body) : api.post("/locations", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["locations"] });
      toast.success({ title: editingLocation ? "Sucursal actualizada" : "Sucursal creada" });
      setShowLocationForm(false);
      setEditingLocation(null);
    },
    onError: (cause) => toast.error({ title: "No se pudo guardar la sucursal", detail: errorMessage(cause) })
  });
  const saveCategory = useMutation({
    mutationFn: (body: { name: string }) =>
      editingCategory ? api.patch(`/categories/${editingCategory.id}`, body) : api.post("/categories", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["categories"] });
      toast.success({ title: editingCategory ? "Categoría actualizada" : "Categoría creada" });
      setShowCategoryForm(false);
      setEditingCategory(null);
    },
    onError: (cause) => toast.error({ title: "No se pudo guardar la categoría", detail: errorMessage(cause) })
  });
  const saveUnit = useMutation({
    mutationFn: (body: { name: string; symbol: string; allowDecimals: boolean; decimalPlaces: number }) =>
      editingUnit ? api.patch(`/units/${editingUnit.id}`, body) : api.post("/units", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["units"] });
      toast.success({ title: editingUnit ? "Unidad actualizada" : "Unidad creada" });
      setShowUnitForm(false);
      setEditingUnit(null);
    },
    onError: (cause) => toast.error({ title: "No se pudo guardar la unidad", detail: errorMessage(cause) })
  });

  return (
    <Page icon={<IconBox />} title="Catálogo" subtitle="Sucursales, categorías y unidades del sistema">
      <section className="settings-grid">
        <article className="panel">
          <div className="section-heading">
            <h2>Sucursales</h2>
            {canEdit && <button className="icon-button" aria-label="Nueva sucursal" onClick={() => { setEditingLocation(null); setShowLocationForm(true); }}><IconPlus size={17} /></button>}
          </div>
          {locations.map((item) => (
            <div className="list-row" key={item.id}>
              <div><strong>{item.name}</strong><small><span className="folio">{item.folio}</span> · {item.code}</small></div>
              {canEdit && <span className="row-actions"><button aria-label={`Editar ${item.name}`} onClick={() => { setEditingLocation(item); setShowLocationForm(true); }}><IconPencil size={17} /></button></span>}
            </div>
          ))}
        </article>
        <article className="panel">
          <div className="section-heading">
            <h2>Categorías</h2>
            {canEdit && <button className="icon-button" aria-label="Nueva categoría" onClick={() => { setEditingCategory(null); setShowCategoryForm(true); }}><IconPlus size={17} /></button>}
          </div>
          {categories.map((item) => (
            <div className="list-row" key={item.id}>
              <div><strong>{item.name}</strong><small className="folio">{item.folio}</small></div>
              {canEdit && <span className="row-actions"><button aria-label={`Editar ${item.name}`} onClick={() => { setEditingCategory(item); setShowCategoryForm(true); }}><IconPencil size={17} /></button></span>}
            </div>
          ))}
        </article>
        <article className="panel">
          <div className="section-heading">
            <h2>Unidades</h2>
            {canEdit && <button className="icon-button" aria-label="Nueva unidad" onClick={() => { setEditingUnit(null); setShowUnitForm(true); }}><IconPlus size={17} /></button>}
          </div>
          {units.map((item) => (
            <div className="list-row" key={item.id}>
              <div><strong>{item.name}</strong><small><span className="folio">{item.folio}</span> · {item.symbol}</small></div>
              {canEdit && <span className="row-actions"><button aria-label={`Editar ${item.name}`} onClick={() => { setEditingUnit(item); setShowUnitForm(true); }}><IconPencil size={17} /></button></span>}
            </div>
          ))}
        </article>
      </section>

      {showLocationForm && (
        <Modal
          key={editingLocation?.id ?? "new-location"}
          title={editingLocation ? "Editar sucursal" : "Nueva sucursal"}
          description="Nombre visible y código corto para las etiquetas."
          onClose={() => setShowLocationForm(false)}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            saveLocation.mutate({ name: String(form.get("name")), code: String(form.get("code")) });
          }}
          actions={
            <>
              <button type="button" className="button ghost" onClick={() => setShowLocationForm(false)}>Cancelar</button>
              <button className="button primary" disabled={saveLocation.isPending}>
                {editingLocation ? "Guardar cambios" : "Crear sucursal"}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label>Nombre<input name="name" required minLength={2} autoFocus defaultValue={editingLocation?.name} /></label>
            <label>Código<input name="code" required maxLength={12} defaultValue={editingLocation?.code} /></label>
          </div>
          {saveLocation.error && <div className="form-error">{saveLocation.error.message}</div>}
        </Modal>
      )}

      {showCategoryForm && (
        <Modal
          key={editingCategory?.id ?? "new-category"}
          title={editingCategory ? "Editar categoría" : "Nueva categoría"}
          onClose={() => setShowCategoryForm(false)}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            saveCategory.mutate({ name: String(form.get("name")) });
          }}
          actions={
            <>
              <button type="button" className="button ghost" onClick={() => setShowCategoryForm(false)}>Cancelar</button>
              <button className="button primary" disabled={saveCategory.isPending}>
                {editingCategory ? "Guardar cambios" : "Crear categoría"}
              </button>
            </>
          }
        >
          <label className="full">Nombre<input name="name" required minLength={2} autoFocus defaultValue={editingCategory?.name} /></label>
          {saveCategory.error && <div className="form-error">{saveCategory.error.message}</div>}
        </Modal>
      )}

      {showUnitForm && (
        <Modal
          key={editingUnit?.id ?? "new-unit"}
          title={editingUnit ? "Editar unidad" : "Nueva unidad"}
          description="El símbolo es lo que se muestra junto a cada cantidad."
          onClose={() => setShowUnitForm(false)}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const allowDecimals = form.get("allowDecimals") === "on";
            saveUnit.mutate({
              name: String(form.get("name")),
              symbol: String(form.get("symbol")),
              allowDecimals,
              decimalPlaces: allowDecimals ? 2 : 0
            });
          }}
          actions={
            <>
              <button type="button" className="button ghost" onClick={() => setShowUnitForm(false)}>Cancelar</button>
              <button className="button primary" disabled={saveUnit.isPending}>
                {editingUnit ? "Guardar cambios" : "Crear unidad"}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <label>Nombre<input name="name" required minLength={2} autoFocus defaultValue={editingUnit?.name} /></label>
            <label>Símbolo<input name="symbol" required maxLength={6} defaultValue={editingUnit?.symbol} /></label>
          </div>
          <label className="checkbox-field full">
            <input type="checkbox" name="allowDecimals" defaultChecked={editingUnit?.allowDecimals} />
            Permite decimales
          </label>
          {saveUnit.error && <div className="form-error">{saveUnit.error.message}</div>}
        </Modal>
      )}
    </Page>
  );
}

export function ConfigPage() {
  const toast = useToast();
  const [tolerancePercent, setTolerancePercent] = useState(() => getReceptionTolerance() * 100);
  const [saved, setSaved] = useState(false);

  function save() {
    const clamped = Math.min(20, Math.max(0, tolerancePercent));
    localStorage.setItem(RECEPTION_TOLERANCE_KEY, String(clamped / 100));
    setTolerancePercent(clamped);
    setSaved(true);
    toast.success({ title: "Tolerancia guardada", detail: `Diferencias hasta ${clamped}% se marcan como leves.` });
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Page icon={<IconSettings />} title="Configuración" subtitle="Ajustes generales del sistema">
      <section className="panel">
        <h2>Tolerancia de diferencias en recepción</h2>
        <p className="muted">
          Diferencias entre lo enviado y lo recibido iguales o menores a este porcentaje se marcan como
          advertencia leve en lugar de crítica. Se guarda en este dispositivo.
        </p>
        <div className="tolerance-field">
          <input
            type="number"
            min="0"
            max="20"
            step="0.5"
            value={tolerancePercent}
            onChange={(event) => setTolerancePercent(Number(event.target.value))}
          />
          <span>%</span>
          <button className="button primary" onClick={save}>Guardar</button>
          {saved && <small className="save-indicator saved"><IconCircleCheck size={16} />Guardado</small>}
        </div>
      </section>
      <section className="panel">
        <h2>Acerca del sistema</h2>
        <div className="list-row"><div><strong>FATBOY Sistema de Inventario</strong><small>Versión</small></div><span>v1.0.0</span></div>
      </section>
    </Page>
  );
}
