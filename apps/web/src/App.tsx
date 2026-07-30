import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBolt,
  IconBox,
  IconCategory,
  IconClipboardCheck,
  IconChecklist,
  IconFileAnalytics,
  IconHome,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLogout,
  IconPackageExport,
  IconPackageImport,
  IconReceipt,
  IconSettings,
  IconStack2,
  IconTruck,
  IconUsers,
  IconBuildingStore,
  IconBell,
  IconShieldLock,
  IconWifi
} from "@tabler/icons-react";
import type { SessionUser } from "@fatboy/shared";
import { api, login, logout, refreshSession } from "./api";
import { errorMessage, useToast } from "./toast";
import type { Location } from "./types";
import { AppLink, Router, useRouter } from "./router";
import {
  AuditPage,
  CatalogPage,
  ConfigPage,
  CountCapturePage,
  CountsPage,
  DashboardPage,
  IncidentsPage,
  InventoryPage,
  ProductsPage,
  PurchasesPage,
  ReceivingPage,
  ReportsPage,
  RequestsPage,
  TransfersPage,
  UsersPage
} from "./pages";

type AppContextValue = {
  user: SessionUser;
  locations: Location[];
  locationId: string;
  setLocationId: (id: string) => void;
  signOut: () => Promise<void>;
};

const AppContext = createContext<AppContextValue | null>(null);
export const useApp = () => useContext(AppContext)!;

export function App() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    refreshSession().then(setUser);
  }, []);

  if (user === undefined) return <Splash />;
  if (!user) return <LoginPage onLogin={setUser} />;

  return (
    <AuthenticatedApp
      user={user}
      onLogout={async () => {
        await logout();
        setUser(null);
      }}
    />
  );
}

function Splash() {
  return (
    <div className="splash">
      <img src="/icon-192.png" alt="FATBOY" />
      <strong>FATBOY</strong>
      <div className="splash-bar"><i /></div>
    </div>
  );
}

/** Marca del sistema: el ícono de la app más el logotipo tipográfico. */
function Brand() {
  return (
    <div className="brand">
      <img className="brand-mark" src="/icon-192.png" alt="" />
      <span className="brand-word">
        <strong>FATBOY</strong>
        <span>SISTEMA DE INVENTARIO</span>
      </span>
    </div>
  );
}

function AuthenticatedApp({
  user,
  onLogout
}: {
  user: SessionUser;
  onLogout: () => Promise<void>;
}) {
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<Location[]>("/locations")
  });
  // Cadena vacía = vista global (todas las sucursales). Es un valor válido y
  // elegido a propósito: nunca se sustituye por "la primera sucursal".
  const [locationId, setLocationId] = useState(
    () => user.locationId || localStorage.getItem("fatboy-location") || ""
  );

  const value = useMemo(
    () => ({
      user,
      locations,
      locationId: user.role === "MANAGER" ? user.locationId || "" : locationId,
      setLocationId: (id: string) => {
        localStorage.setItem("fatboy-location", id);
        setLocationId(id);
      },
      signOut: onLogout
    }),
    [user, locations, locationId, onLogout]
  );

  return (
    <AppContext.Provider value={value}>
      <Router><Shell /></Router>
    </AppContext.Provider>
  );
}

const adminNavigation = [
  ["/", "Inicio", IconHome],
  ["/productos", "Productos", IconBox],
  ["/catalogo", "Catálogo", IconCategory],
  ["/stock", "Stock", IconStack2],
  ["/entradas", "Entradas", IconPackageImport],
  ["/conteos", "Conteos", IconClipboardCheck],
  ["/solicitudes", "Solicitudes", IconReceipt],
  ["/surtidos", "Surtidos", IconPackageExport],
  ["/repartos", "Repartos", IconTruck],
  ["/recepciones", "Recepciones", IconChecklist],
  ["/incidencias", "Incidencias", IconAlertTriangle],
  ["/reportes", "Reportes", IconFileAnalytics],
  ["/usuarios", "Usuarios", IconUsers],
  ["/configuracion", "Configuración", IconSettings]
] as const;

// El supervisor opera todas las sucursales y además lleva sus propios repartos.
const supervisorNavigation = [
  ["/", "Inicio", IconHome],
  ["/stock", "Stock", IconStack2],
  ["/entradas", "Entradas", IconPackageImport],
  ["/conteos", "Conteos", IconClipboardCheck],
  ["/solicitudes", "Solicitudes", IconReceipt],
  ["/surtidos", "Surtidos", IconPackageExport],
  ["/repartos", "Mis entregas", IconTruck],
  ["/recepciones", "Recepciones", IconChecklist],
  ["/incidencias", "Incidencias", IconAlertTriangle],
  ["/reportes", "Reportes", IconFileAnalytics]
] as const;

const managerNavigation = [
  ["/", "Inicio", IconHome],
  ["/stock", "Stock", IconStack2],
  ["/conteos", "Conteo", IconClipboardCheck],
  ["/solicitudes", "Solicitudes", IconReceipt],
  ["/recepciones", "Recibir", IconChecklist],
  ["/incidencias", "Incidencias", IconAlertTriangle]
] as const;

const driverNavigation = [
  ["/repartos", "Entregas", IconTruck],
  ["/reportes", "Historial", IconFileAnalytics]
] as const;

function Shell() {
  const app = useApp();
  const route = useRouter();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("fatboy-sidebar-collapsed") === "1"
  );
  const nav =
    app.user.role === "DRIVER"
      ? driverNavigation
      : app.user.role === "MANAGER"
        ? managerNavigation
        : app.user.role === "SUPERVISOR"
          ? supervisorNavigation
          : adminNavigation;
  const active = nav.find(([path]) => path === route.path)?.[1] || "FATBOY";

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("fatboy-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <aside className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <Brand />
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {collapsed ? <IconLayoutSidebarLeftExpand size={16} /> : <IconLayoutSidebarLeftCollapse size={16} />}
        </button>
        <nav>
          {nav.map(([path, label, Icon]) => (
            <AppLink key={path} href={path} active={route.path === path} title={label}>
              <Icon size={21} /><span>{label}</span>
            </AppLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <small>Fatboy Restaurant</small>
          <span>v1.0.0</span>
        </div>
      </aside>

      <header className="topbar">
        <div className="mobile-brand"><img src="/icon-192.png" alt="" /><strong>FATBOY</strong></div>
        {app.user.role !== "DRIVER" && app.user.role !== "MANAGER" && (
          <label className="location-picker">
            <IconBuildingStore size={19} />
            <span>Sucursal:</span>
            <select value={app.locationId} onChange={(event) => app.setLocationId(event.target.value)}>
              <option value="">Vista global</option>
              {app.locations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </label>
        )}
        <NotificationsButton />
        <div className="profile">
          <span className="avatar">{app.user.name.slice(0, 1).toUpperCase()}</span>
          <span><strong>{app.user.name}</strong><small>{roleLabel(app.user.role)}</small></span>
        </div>
        <button className="icon-button" onClick={() => void app.signOut()} aria-label="Cerrar sesión">
          <IconLogout size={20} />
        </button>
      </header>

      <main className="content" aria-label={active}>
        {/* La llave por ruta reinicia la animación de entrada en cada vista */}
        <div className="view" key={route.path}>
          <RouteContent path={route.path} />
        </div>
      </main>

      <nav className="bottom-nav" aria-label="Navegación principal">
        {nav.slice(0, 5).map(([path, label, Icon]) => (
          <AppLink key={path} href={path} active={route.path === path}>
            <Icon size={22} /><span>{label}</span>
          </AppLink>
        ))}
      </nav>
    </div>
  );
}

/** Campana del sistema: resume lo pendiente sin sacar al usuario de su pantalla. */
function NotificationsButton() {
  const app = useApp();
  const toast = useToast();
  const { data } = useQuery<Record<string, number>>({
    queryKey: ["dashboard", app.locationId],
    queryFn: () => api.get(`/dashboard${app.locationId ? `?locationId=${app.locationId}` : ""}`),
    refetchInterval: 60_000
  });

  const pending = [
    ["solicitudes pendientes", data?.pendingRequests ?? 0],
    ["surtidos por preparar", data?.preparingTransfers ?? 0],
    ["recepciones pendientes", data?.pendingReceipts ?? 0],
    ["incidencias abiertas", data?.openIncidents ?? 0]
  ].filter(([, value]) => Number(value) > 0) as [string, number][];

  return (
    <button
      className={`icon-button${pending.length ? " has-dot" : ""}`}
      aria-label={pending.length ? `Notificaciones: ${pending.length} temas pendientes` : "Notificaciones"}
      onClick={() =>
        pending.length
          ? toast.warning({
              title: "Pendientes de hoy",
              detail: pending.map(([label, value]) => `${value} ${label}`).join(" · ")
            })
          : toast.success({ title: "Todo al día", detail: "No hay pendientes en esta sucursal." })
      }
    >
      <IconBell size={21} />
    </button>
  );
}

function RouteContent({ path }: { path: string }) {
  if (path === "/") return <DashboardPage />;
  if (path === "/productos") return <ProductsPage />;
  if (path === "/catalogo") return <CatalogPage />;
  if (path === "/stock") return <InventoryPage />;
  if (path === "/entradas") return <PurchasesPage />;
  if (path === "/conteos") return <CountsPage />;
  if (/^\/conteos\/[^/]+$/.test(path)) return <CountCapturePage />;
  if (path === "/solicitudes") return <RequestsPage />;
  if (path === "/surtidos") return <TransfersPage />;
  if (path === "/repartos") return <TransfersPage driverMode />;
  if (path === "/recepciones") return <ReceivingPage />;
  if (path === "/incidencias") return <IncidentsPage />;
  if (path === "/reportes") return <ReportsPage />;
  if (path === "/usuarios") return <UsersPage />;
  if (path === "/auditoria") return <AuditPage />;
  if (path === "/configuracion") return <ConfigPage />;
  return <DashboardPage />;
}

const loginHighlights = [
  [IconClipboardCheck, "Conteo físico guiado, producto por producto"],
  [IconTruck, "Reparto entre sucursales con seguimiento en vivo"],
  [IconWifi, "Sigue capturando aunque se caiga la señal"],
  [IconShieldLock, "Accesos por rol y bitácora de auditoría"]
] as const;

function LoginPage({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const toast = useToast();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const user = await login(String(data.get("email")), String(data.get("password")));
      toast.success({ title: `Bienvenido, ${user.name.split(" ")[0]}`, detail: roleLabel(user.role) });
      onLogin(user);
    } catch (cause) {
      const message = errorMessage(cause, "No pudimos iniciar sesión");
      setError(message);
      toast.error({ title: "Acceso denegado", detail: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-brand">
        <img src="/icon-512.png" alt="FATBOY" />
        <div className="login-title">
          <h1>FATBOY</h1>
          <span>Sistema de Inventario</span>
        </div>
        <p>Conteo, solicitudes y reparto entre sucursales, en un solo tablero.</p>
        <div className="login-features">
          {loginHighlights.map(([Icon, label]) => (
            <span key={label}><Icon size={18} />{label}</span>
          ))}
        </div>
      </section>
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">Acceso al sistema</span>
        <h2>Bienvenido</h2>
        <p>Ingresa con tu cuenta asignada.</p>
        <label>Correo electrónico<input name="email" type="email" autoComplete="email" required autoFocus /></label>
        <label>Contraseña<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="button primary" disabled={busy}>
          {busy ? "Ingresando…" : <><IconBolt size={18} />Iniciar sesión</>}
        </button>
      </form>
    </main>
  );
}

function roleLabel(role: SessionUser["role"]) {
  return {
    SYSTEM_OWNER: "Propietario del sistema",
    ADMIN: "Administrador",
    SUPERVISOR: "Encargado supervisor",
    MANAGER: "Encargado",
    DRIVER: "Repartidor"
  }[role];
}

export function Page({
  icon,
  title,
  subtitle,
  action,
  children
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div className="page-heading">
        <span className="page-icon">{icon}</span>
        <div><h1>{title}</h1><p>{subtitle}</p></div>
        {action && <div className="page-actions">{action}</div>}
      </div>
      {children}
    </>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty"><IconBox size={38} /><p>{children}</p></div>;
}

/** Marcador de carga con el mismo peso visual que el contenido real, para que nada salte. */
export function Skeleton({ rows = 5, variant = "row" }: { rows?: number; variant?: "row" | "card" }) {
  return (
    <div className={variant === "card" ? "stock-grid" : "skeleton-list"} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div className={`skeleton skeleton-${variant}`} key={index} />
      ))}
    </div>
  );
}
