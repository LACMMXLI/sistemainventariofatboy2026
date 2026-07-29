import { useEffect, useState, type FormEvent, type ReactNode } from "react";
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
  IconPackageExport,
  IconPencil,
  IconPower,
  IconPlus,
  IconReceipt,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTruck,
  IconUsers,
  IconX
} from "@tabler/icons-react";
import { api } from "./api";
import { Empty, Page, useApp } from "./App";
import { useRouter } from "./router";
import { listDrafts, removeDraft, saveDraft } from "./offline";
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

  return (
    <Page icon={<IconBuildingStore />} title={`Hola, ${user.name.split(" ")[0]}`} subtitle="Esto requiere atención hoy.">
      <section className="kpi-grid">
        {cards.map(([label, value, Icon, color]) => (
          <article className="kpi-card" key={label}>
            <span className={`kpi-icon ${color}`}><Icon size={25} /></span>
            <div><span>{label}</span><strong>{isLoading ? "—" : value}</strong></div>
          </article>
        ))}
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
    mutationFn: (body: object) => editing
      ? api.patch(`/products/${editing.id}`, body)
      : api.post("/products", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["products"] });
      setShowForm(false);
      setEditing(null);
    }
  });
  const changeActive = useMutation({
    mutationFn: (product: Product) =>
      api.post(`/products/${product.id}/${product.active ? "deactivate" : "activate"}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["products"] })
  });
  const active = products.filter((product) => product.active).length;
  const visible = products.filter((product) =>
    product.name.toLocaleLowerCase("es-MX").includes(search.toLocaleLowerCase("es-MX")) &&
    (!categoryId || product.categoryId === categoryId) &&
    (!unitId || product.unitId === unitId) &&
    (!activeFilter || String(product.active) === activeFilter)
  );
  const canEdit = ["SYSTEM_OWNER", "ADMIN"].includes(user.role);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    create.mutate({
      name: String(form.get("name")),
      sku: String(form.get("sku") || "") || null,
      categoryId: String(form.get("categoryId")),
      unitId: String(form.get("unitId")),
      imageUrl: String(form.get("imageUrl") || "") || null,
      active: editing?.active ?? true,
      sortOrder: 0
    });
  }

  return (
    <Page
      icon={<IconBox />}
      title="Productos"
      subtitle="Catálogo de productos del sistema"
      action={canEdit && <button className="button primary" onClick={() => { setEditing(null); setShowForm(true); }}><IconPlus size={19} />Nuevo producto</button>}
    >
      <section className="kpi-grid products-kpis">
        <Kpi label="Total productos" value={products.length} icon={<IconBox />} color="blue" />
        <Kpi label="Productos activos" value={active} icon={<IconCheck />} color="green" />
        <Kpi label="Productos inactivos" value={products.length - active} icon={<IconX />} color="slate" />
        <Kpi label="Sucursales activas" value={new Set(products.flatMap((p) => p.locations.map((l) => l.location.id))).size} icon={<IconBuildingStore />} color="blue" />
      </section>
      <section className="panel filters product-filters">
        <label className="search"><IconSearch size={19} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto…" /></label>
        <label><span>Categoría</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">Todas</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Unidad</span><select value={unitId} onChange={(event) => setUnitId(event.target.value)}><option value="">Todas</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Estatus</span><select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}><option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></label>
        <button className="button ghost" onClick={() => { setSearch(""); setCategoryId(""); setUnitId(""); setActiveFilter(""); }}><IconRefresh size={18} />Limpiar</button>
      </section>
      <section className="panel data-panel">
        {isLoading ? <p className="muted">Cargando productos…</p> : visible.length ? (
          <>
            <div className="table products-table">
              <div className="table-head"><span>Producto</span><span>Categoría</span><span>Unidad</span><span>Sucursales</span><span>Estatus</span><span>Actualización</span><span>Acciones</span></div>
              {visible.map((product) => (
                <div className="table-row" key={product.id}>
                  <span className="product-cell"><span className="product-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <IconBox size={22} />}</span><span><strong>{product.name}</strong><small>{product.sku || "Sin SKU"}</small></span></span>
                  <span><span className="category-pill">{product.category.name}</span></span>
                  <span>{product.unit.symbol}</span>
                  <span className="location-dots">{product.locations.map(({ location }) => <i title={location.name} key={location.id}>{location.code.slice(0, 2)}</i>)}</span>
                  <span><Status value={product.active ? "Activo" : "Inactivo"} /></span>
                  <span className="updated-cell"><strong>{new Intl.DateTimeFormat("es-MX").format(new Date(product.updatedAt))}</strong><small>{new Intl.DateTimeFormat("es-MX", { timeStyle: "short" }).format(new Date(product.updatedAt))}</small></span>
                  <span className="row-actions">{canEdit && <><button aria-label={`Editar ${product.name}`} onClick={() => { setEditing(product); setShowForm(true); }}><IconPencil size={17} /></button><button aria-label={`${product.active ? "Desactivar" : "Activar"} ${product.name}`} onClick={() => changeActive.mutate(product)}><IconPower size={17} /></button></>}</span>
                </div>
              ))}
            </div>
            <div className="mobile-list">{visible.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          </>
        ) : <Empty>No hay productos que coincidan.</Empty>}
      </section>
      {showForm && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={submit} key={editing?.id ?? "new"}>
            <div className="modal-heading"><div><h2>{editing ? "Editar producto" : "Nuevo producto"}</h2><p>{editing ? "Actualiza la información operativa." : "Agrega un producto al catálogo maestro."}</p></div><button type="button" className="icon-button" onClick={() => setShowForm(false)}><IconX /></button></div>
            <label>Nombre<input name="name" required minLength={2} autoFocus defaultValue={editing?.name} /></label>
            <label>SKU opcional<input name="sku" defaultValue={editing?.sku ?? ""} /></label>
            <div className="form-grid">
              <label>Categoría<select name="categoryId" required defaultValue={editing?.categoryId ?? ""}><option value="">Selecciona</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>Unidad<select name="unitId" required defaultValue={editing?.unitId ?? ""}><option value="">Selecciona</option>{units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            </div>
            <label>URL de imagen opcional<input name="imageUrl" defaultValue={editing?.imageUrl ?? ""} /></label>
            {create.error && <div className="form-error">{create.error.message}</div>}
            <div className="modal-actions"><button type="button" className="button ghost" onClick={() => setShowForm(false)}>Cancelar</button><button className="button primary" disabled={create.isPending}>Guardar producto</button></div>
          </form>
        </div>
      )}
    </Page>
  );
}

function ProductCard({ product }: { product: Product }) {
  return (
    <article className="mobile-card">
      <span className="product-thumb">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <IconBox size={22} />}</span>
      <div><strong>{product.name}</strong><small>{product.category.name} · {product.unit.symbol}</small></div>
      <Status value={product.active ? "Activo" : "Inactivo"} />
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
    <Page icon={<IconFileAnalytics />} title="Stock actual" subtitle="Existencias confirmadas por el servidor">
      <section className="panel filters"><label className="search"><IconSearch size={19} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" /></label></section>
      <section className="panel data-panel">
        {isLoading ? <p>Cargando stock…</p> : visible.length ? (
          <div className="stock-grid">
            {visible.map((row) => <article className="stock-card" key={row.id}><div><strong>{row.product.name}</strong><small>{row.location.name} · {row.product.category.name}</small></div><span className="stock-quantity">{quantity(row.quantity)} <small>{row.product.unit.symbol}</small></span><small>Actualizado {date(row.updatedAt)}</small></article>)}
          </div>
        ) : <Empty>Todavía no hay balances para esta sucursal.</Empty>}
      </section>
    </Page>
  );
}

export function CountsPage() {
  const { locationId } = useApp();
  const client = useQueryClient();
  const { navigate } = useRouter();
  const { data: counts = [] } = useQuery({
    queryKey: ["counts", locationId],
    queryFn: () => api.get<StockCount[]>(withLocation("/counts", locationId))
  });
  const start = useMutation({
    mutationFn: () => api.post<StockCount>("/counts", { locationId }),
    onSuccess: (count) => {
      void client.invalidateQueries({ queryKey: ["counts"] });
      navigate(`/conteos/${count.id}`);
    }
  });
  const active = counts.find((count) => count.status === "IN_PROGRESS");
  return (
    <Page icon={<IconClipboardCheck />} title="Conteos" subtitle="Captura física sin mostrar el stock registrado" action={!active && <button className="button primary" disabled={!locationId || start.isPending} onClick={() => start.mutate()}><IconPlus size={19} />Nuevo conteo</button>}>
      {start.error && <div className="form-error">{start.error.message}</div>}
      {active && <section className="panel active-count"><div><span className="eyebrow">CONTEO EN PROGRESO</span><h2>{active.location.name}</h2><p>Continúa donde te quedaste. Los cambios se guardan producto por producto.</p></div><button className="button primary" onClick={() => navigate(`/conteos/${active.id}`)}>Continuar</button></section>}
      <section className="panel data-panel">
        <h2>Historial</h2>
        {counts.length ? counts.map((count) => <article className="list-row" key={count.id}><div><strong>{count.location.name}</strong><small>{date(count.startedAt)} · {count._count?.lines ?? 0} productos</small></div><Status value={count.status} /></article>) : <Empty>No hay conteos registrados.</Empty>}
      </section>
    </Page>
  );
}

export function CountCapturePage() {
  const { path, navigate } = useRouter();
  const id = path.split("/")[2] ?? "";
  const client = useQueryClient();
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
      navigate("/conteos");
    }
  });

  if (!count?.lines) return <p className="muted">Cargando conteo…</p>;
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
        <div className="modal-overlay" onClick={() => setShowValidation(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{validation.valid ? "Resumen del conteo" : "Errores detectados"}</h2>
              <button className="icon-button" onClick={() => setShowValidation(false)}><IconX /></button>
            </div>
            {!validation.valid && validation.issues.length > 0 && (
              <div className="form-error">{validation.issues.map((issue: string) => <div key={issue}>{issue}</div>)}</div>
            )}
            {validation.adjustments.length > 0 && (
              <table className="adjustments-table">
                <thead><tr><th>Producto</th><th>Diferencia</th><th>Stock nuevo</th></tr></thead>
                <tbody>
                  {validation.adjustments.map((adj: any) => (
                    <tr key={adj.productId}>
                      <td>{adj.productName}</td>
                      <td className={adj.delta.startsWith('-') ? 'negative' : 'positive'}>{adj.delta}</td>
                      <td>{quantity(adj.newBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="modal-actions">
              <button className="button" onClick={() => setShowValidation(false)}>Cancelar</button>
              <button className="button primary" disabled={!validation.valid || complete.isPending} onClick={() => complete.mutate()}>
                {complete.isPending ? "Procesando..." : "Confirmar"}
              </button>
            </div>
            {complete.error && <div className="form-error">{complete.error.message}</div>}
          </div>
        </div>
      )}
    </Page>
  );
}

function CountInput({ countId, line, onSaved, onQueued }: { countId: string; line: CountLine; onSaved: () => void; onQueued: () => void }) {
  const [value, setValue] = useState(line.countedQuantity ?? "");
  const [notes, setNotes] = useState(line.countNotes ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "queued">("idle");

  async function save() {
    if (value === "") return;
    const draft = {
      id: `${countId}:${line.id}`,
      countId,
      lineId: line.id,
      countedQuantity: value,
      notes: notes || undefined,
      version: line.version,
      clientMutationId: crypto.randomUUID(),
      createdAt: Date.now()
    };
    setState("saving");
    try {
      await api.patch(`/counts/${countId}/lines/${line.id}`, draft);
      await removeDraft(draft.id);
      setState("saved");
      onSaved();
    } catch (error) {
      if (navigator.onLine) {
        setState("idle");
        throw error;
      }
      await saveDraft(draft);
      setState("queued");
      onQueued();
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
        <label><span className="sr-only">Cantidad de {line.product.name}</span><input inputMode="decimal" type="number" min="0" step={line.product.unit.allowDecimals ? "0.01" : "1"} value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => void save()} /></label>
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
  const [creating, setCreating] = useState(false);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const { data: requests = [] } = useQuery({ queryKey: ["requests", locationId], queryFn: () => api.get<SupplyRequest[]>(withLocation("/requests", locationId)) });
  const { data: products = [] } = useQuery({ queryKey: ["products", locationId], queryFn: () => api.get<Product[]>(withLocation("/products", locationId)) });
  const create = useMutation({
    mutationFn: async () => {
      const request = await api.post<{ id: string }>("/requests", {
        locationId,
        lines: Object.entries(amounts).filter(([, value]) => Number(value) > 0).map(([productId, value]) => ({ productId, quantity: value }))
      });
      return api.post(`/requests/${request.id}/submit`);
    },
    onSuccess: () => {
      setCreating(false);
      setAmounts({});
      void client.invalidateQueries({ queryKey: ["requests"] });
    }
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
    onSuccess: () => void client.invalidateQueries({ queryKey: ["transfers"] })
  });
  return (
    <Page icon={<IconReceipt />} title="Solicitudes" subtitle="Productos requeridos por la sucursal" action={<button className="button primary" onClick={() => setCreating(true)}><IconPlus size={19} />Nueva solicitud</button>}>
      {creating && <section className="panel request-builder"><div className="section-heading"><div><h2>Nueva solicitud</h2><p>Captura únicamente lo que necesita la sucursal.</p></div><button className="icon-button" onClick={() => setCreating(false)}><IconX /></button></div>{products.map((product) => <label className="request-line" key={product.id}><span><strong>{product.name}</strong><small>{product.unit.symbol}</small></span><input type="number" min="0" step={product.unit.allowDecimals ? "0.01" : "1"} inputMode="decimal" placeholder="0" value={amounts[product.id] ?? ""} onChange={(event) => setAmounts({ ...amounts, [product.id]: event.target.value })} /></label>)}<div className="sticky-submit"><button className="button primary" disabled={!Object.values(amounts).some((value) => Number(value) > 0) || create.isPending} onClick={() => create.mutate()}>Enviar solicitud</button></div>{create.error && <div className="form-error">{create.error.message}</div>}</section>}
      <section className="panel data-panel">{requests.length ? requests.map((request) => <article className="list-row" key={request.id}><div><strong>Solicitud #{request.id.slice(-6).toUpperCase()}</strong><small>{request.location.name} · {request.lines.length} productos · {date(request.createdAt)}</small></div><Status value={request.status} />{["SYSTEM_OWNER", "ADMIN"].includes(user.role) && ["PENDING", "PARTIAL"].includes(request.status) && <button className="button ghost" disabled={createTransfer.isPending} onClick={() => createTransfer.mutate(request)}>Crear surtido</button>}</article>) : <Empty>No hay solicitudes registradas.</Empty>}</section>
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
    },
    onError: (error: any) => console.error("Error creating transfer:", error)
  });
  const transition = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "start" | "deliver" }) => api.post(`/transfers/${id}/${action}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["transfers"] })
  });
  const assign = useMutation({
    mutationFn: ({ id, driverUserId }: { id: string; driverUserId: string }) =>
      api.post(`/transfers/${id}/assign-driver`, { driverUserId }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["transfers"] })
  });
  return (
    <Page icon={<IconTruck />} title={driverMode || user.role === "DRIVER" ? "Mis entregas" : "Surtidos"} subtitle={driverMode || user.role === "DRIVER" ? "Entregas asignadas a tu usuario" : "Preparación y seguimiento de producto"} action={!driverMode && !["DRIVER", "MANAGER"].includes(user.role) && <button className="button primary" onClick={() => setCreating(true)}><IconPlus size={19} />Crear surtido</button>}>
      {creating && <section className="panel request-builder"><div className="section-heading"><div><h2>Nuevo surtido</h2><p>Selecciona origen y destino, luego agrega productos.</p></div><button className="icon-button" onClick={() => setCreating(false)}><IconX /></button></div><div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px"}}><label>Origen<select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Selecciona</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Destino<select value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Selecciona</option>{locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>{products.map((product) => <label className="request-line" key={product.id}><span><strong>{product.name}</strong><small>{product.unit.symbol}</small></span><input type="number" min="0" inputMode="decimal" placeholder="0" value={amounts[product.id] ?? ""} onChange={(event) => setAmounts({ ...amounts, [product.id]: event.target.value })} /></label>)}<div className="sticky-submit"><button className="button primary" disabled={!source || !destination || !Object.values(amounts).some((value) => Number(value) > 0) || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Preparando..." : "Preparar surtido"}</button></div>{create.error && <div className="form-error">{typeof create.error.message === 'string' ? create.error.message : JSON.stringify(create.error.message)}</div>}</section>}
      <section className="delivery-grid">{transfers.length ? transfers.map((transfer) => <article className="delivery-card" key={transfer.id}><div className="delivery-heading"><div><span className="eyebrow">{transfer.destination.name}</span><h2>Surtido #{transfer.id.slice(-6).toUpperCase()}</h2></div><Status value={transfer.status} /></div><TransferTimeline status={transfer.status} /><ul>{transfer.lines.map((line) => <li key={line.id}><span>{line.product.name}</span><strong>{quantity(line.sentQuantity)} {line.product.unit.symbol}</strong></li>)}</ul>{transfer.driver && <p className="muted">🚗 {transfer.driver.name}</p>}{["SYSTEM_OWNER", "ADMIN"].includes(user.role) && transfer.status === "PREPARING" && <label className="driver-select">Asignar repartidor<select defaultValue="" onChange={(event) => event.target.value && assign.mutate({ id: transfer.id, driverUserId: event.target.value })}><option value="">Selecciona</option>{users.filter((item) => item.role === "DRIVER" && item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}{user.role === "DRIVER" && transfer.status === "ASSIGNED" && <button className="button primary wide" onClick={() => transition.mutate({ id: transfer.id, action: "start" })}>Iniciar reparto</button>}{user.role === "DRIVER" && transfer.status === "IN_ROUTE" && <button className="button primary wide" onClick={() => transition.mutate({ id: transfer.id, action: "deliver" })}>Marcar entrega</button>}</article>) : <Empty>No hay entregas en esta vista.</Empty>}</section>
    </Page>
  );
}

export function ReceivingPage() {
  const { locationId } = useApp();
  const client = useQueryClient();
  const [selected, setSelected] = useState<Transfer | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const { data: transfers = [] } = useQuery({ queryKey: ["transfers", locationId], queryFn: () => api.get<Transfer[]>(withLocation("/transfers", locationId)) });
  const delivered = transfers.filter((transfer) => transfer.status === "DELIVERED");
  const receive = useMutation({
    mutationFn: () => api.post(`/transfers/${selected!.id}/receive`, { lines: selected!.lines.map((line) => ({ lineId: line.id, receivedQuantity: amounts[line.id] ?? line.sentQuantity, reason: Number(amounts[line.id] ?? line.sentQuantity) !== Number(line.sentQuantity) ? "Cantidad recibida diferente" : undefined })) }, crypto.randomUUID()),
    onSuccess: () => {
      setSelected(null);
      setAmounts({});
      void client.invalidateQueries({ queryKey: ["transfers"] });
      void client.invalidateQueries({ queryKey: ["inventory"] });
    }
  });
  return (
    <Page icon={<IconChecklist />} title="Recepciones" subtitle="Confirma únicamente lo recibido físicamente">
      {!selected ? <section className="delivery-grid">{delivered.length ? delivered.map((transfer) => <article className="delivery-card" key={transfer.id}><div className="delivery-heading"><div><span className="eyebrow">{transfer.destination.name}</span><h2>Surtido #{transfer.id.slice(-6).toUpperCase()}</h2></div><Status value={transfer.status} /></div><p>{transfer.lines.length} productos por recibir</p><button className="button primary wide" onClick={() => { setSelected(transfer); setAmounts(Object.fromEntries(transfer.lines.map((line) => [line.id, line.sentQuantity]))); }}>Recibir surtido</button></article>) : <Empty>No hay surtidos pendientes de recepción.</Empty>}</section> : <section className="panel request-builder"><div className="section-heading"><div><h2>Recibir surtido</h2><p>{selected.destination.name} · #{selected.id.slice(-6).toUpperCase()}</p></div><button className="icon-button" onClick={() => setSelected(null)}><IconX /></button></div>{selected.lines.map((line) => <label className="reception-line" key={line.id}><span><strong>{line.product.name}</strong><small>Enviado: {quantity(line.sentQuantity)} {line.product.unit.symbol}</small></span><span>Recibido<input type="number" min="0" inputMode="decimal" value={amounts[line.id] ?? ""} onChange={(event) => setAmounts({ ...amounts, [line.id]: event.target.value })} /></span></label>)}<div className="sticky-submit"><button className="button primary" disabled={receive.isPending || Object.values(amounts).some((value) => value === "")} onClick={() => receive.mutate()}>Confirmar recepción</button></div>{receive.error && <div className="form-error">{receive.error.message}</div>}</section>}
    </Page>
  );
}

export function IncidentsPage() {
  const { user, locationId } = useApp();
  const client = useQueryClient();
  const { data: incidents = [] } = useQuery({ queryKey: ["incidents", locationId], queryFn: () => api.get<Incident[]>(withLocation("/incidents", locationId)) });
  const resolve = useMutation({ mutationFn: (id: string) => api.post(`/incidents/${id}/resolve`), onSuccess: () => void client.invalidateQueries({ queryKey: ["incidents"] }) });
  return (
    <Page icon={<IconAlertTriangle />} title="Incidencias" subtitle="Diferencias y daños que requieren seguimiento">
      <section className="panel data-panel">{incidents.length ? incidents.map((incident) => <article className="incident-row" key={incident.id}><span className="kpi-icon red"><IconAlertTriangle /></span><div><strong>{incident.product?.name || incident.type.replaceAll("_", " ")}</strong><small>{incident.location.name} · {incident.description} · {date(incident.createdAt)}</small></div><Status value={incident.status} />{incident.status === "OPEN" && !["MANAGER", "DRIVER"].includes(user.role) && <button className="button ghost" onClick={() => resolve.mutate(incident.id)}>Resolver</button>}</article>) : <Empty>No hay incidencias registradas.</Empty>}</section>
    </Page>
  );
}

export function ReportsPage() {
  const { locationId } = useApp();
  const { data } = useQuery({ queryKey: ["report", locationId], queryFn: () => api.get<Dashboard>(withLocation("/reports/summary", locationId)) });
  return (
    <Page icon={<IconFileAnalytics />} title="Reportes" subtitle="Resumen operativo derivado del backend">
      <section className="kpi-grid"><Kpi label="Solicitudes pendientes" value={data?.pendingRequests ?? 0} icon={<IconReceipt />} color="blue" /><Kpi label="En ruta" value={data?.inRoute ?? 0} icon={<IconTruck />} color="green" /><Kpi label="Recepciones pendientes" value={data?.pendingReceipts ?? 0} icon={<IconChecklist />} color="orange" /><Kpi label="Incidencias abiertas" value={data?.openIncidents ?? 0} icon={<IconAlertTriangle />} color="red" /></section>
    </Page>
  );
}

type UserRow = { id: string; name: string; email: string; role: string; active: boolean; lastLoginAt?: string | null };
export function UsersPage() {
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => api.get<UserRow[]>("/users") });
  return (
    <Page icon={<IconUsers />} title="Usuarios" subtitle="Accesos y roles del sistema">
      <section className="panel data-panel">{users.length ? users.map((user) => <article className="list-row" key={user.id}><div><strong>{user.name}</strong><small>{user.email} · {user.role.replace("_", " ")}</small></div><Status value={user.active ? "Activo" : "Inactivo"} /></article>) : <Empty>No hay usuarios visibles.</Empty>}</section>
    </Page>
  );
}

type Audit = { id: string; action: string; entityType: string; entityId: string; createdAt: string; user: { name: string } };
export function AuditPage() {
  const { data: logs = [] } = useQuery({ queryKey: ["audit"], queryFn: () => api.get<Audit[]>("/audit") });
  return <Page icon={<IconChecklist />} title="Auditoría" subtitle="Acciones administrativas inmutables"><section className="panel data-panel">{logs.map((log) => <article className="list-row" key={log.id}><div><strong>{log.action} · {log.entityType}</strong><small>{log.user.name} · {date(log.createdAt)} · #{log.entityId.slice(-6)}</small></div></article>)}</section></Page>;
}

export function ConfigPage() {
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: () => api.get<Category[]>("/categories") });
  const { data: units = [] } = useQuery({ queryKey: ["units"], queryFn: () => api.get<Unit[]>("/units") });
  const { locations } = useApp();
  return (
    <Page icon={<IconSettings />} title="Configuración" subtitle="Catálogos operativos del sistema">
      <section className="settings-grid"><article className="panel"><h2>Sucursales</h2>{locations.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><small>{item.code}</small></div>)}</article><article className="panel"><h2>Categorías</h2>{categories.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong></div>)}</article><article className="panel"><h2>Unidades</h2>{units.map((item) => <div className="list-row" key={item.id}><strong>{item.name}</strong><small>{item.symbol}</small></div>)}</article></section>
    </Page>
  );
}
