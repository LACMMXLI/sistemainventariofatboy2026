import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconExclamationCircle,
  IconInfoCircle,
  IconX
} from "@tabler/icons-react";

type ToastTone = "success" | "error" | "warning" | "info";

type ToastAction = { label: string; onClick: () => void };

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  detail?: string;
  /** 0 = permanece hasta que el usuario decida. */
  duration: number;
  action?: ToastAction;
  key?: string;
  leaving?: boolean;
};

type ToastInput = {
  title: string;
  detail?: string;
  /** 0 mantiene el aviso en pantalla hasta que se cierre o se use su acción. */
  duration?: number;
  action?: ToastAction;
  /** Evita duplicados: si ya hay un aviso visible con esta llave, se ignora. */
  key?: string;
};

type ToastApi = {
  success: (input: ToastInput | string) => void;
  error: (input: ToastInput | string) => void;
  warning: (input: ToastInput | string) => void;
  info: (input: ToastInput | string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const icons = {
  success: IconCircleCheck,
  error: IconExclamationCircle,
  warning: IconAlertTriangle,
  info: IconInfoCircle
} as const;

/** Duración por defecto: los errores se quedan más tiempo porque piden decisión. */
const defaultDuration: Record<ToastTone, number> = {
  success: 3800,
  info: 4200,
  warning: 5200,
  error: 6500
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 180);
  }, []);

  const push = useCallback(
    (tone: ToastTone, input: ToastInput | string) => {
      const { title, detail, duration, action, key } =
        typeof input === "string" ? ({ title: input } as ToastInput) : input;
      const id = nextId.current++;
      const life = duration ?? defaultDuration[tone];

      setToasts((current) => {
        if (key && current.some((toast) => toast.key === key && !toast.leaving)) return current;
        const next = [...current, { id, tone, title, detail, duration: life, action, key }];
        // Máximo cuatro avisos temporales: más que eso deja de informar y estorba.
        // Los permanentes no se descartan, porque esperan una decisión.
        const keep = new Set(next.filter((toast) => toast.duration === 0));
        next.filter((toast) => toast.duration !== 0).slice(-3).forEach((toast) => keep.add(toast));
        return next.filter((toast) => keep.has(toast));
      });

      if (life > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), life)
        );
      }
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (input) => push("success", input),
      error: (input) => push("error", input),
      warning: (input) => push("warning", input),
      info: (input) => push("info", input)
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* En portal sobre body: dentro del árbol hay contenedores con transform
          y backdrop-filter que reanclarían este `position: fixed`. */}
      {createPortal(
        <div className="toast-viewport" role="region" aria-label="Notificaciones" aria-live="polite">
          {toasts.map((toast) => {
            const Icon = icons[toast.tone];
            return (
              <article className={`toast ${toast.tone}${toast.leaving ? " leaving" : ""}`} key={toast.id}>
                <span className="toast-icon"><Icon size={18} /></span>
                <div className="toast-body">
                  <strong>{toast.title}</strong>
                  {toast.detail && <span>{toast.detail}</span>}
                  {toast.action && (
                    <button
                      type="button"
                      className="toast-action"
                      onClick={() => {
                        toast.action?.onClick();
                        dismiss(toast.id);
                      }}
                    >
                      {toast.action.label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="toast-close"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Cerrar notificación"
                >
                  <IconX size={15} />
                </button>
                {toast.duration > 0 && (
                  <i className="toast-progress" style={{ animationDuration: `${toast.duration}ms` }} />
                )}
              </article>
            );
          })}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast debe usarse dentro de ToastProvider");
  return api;
}

/** Extrae un mensaje legible de cualquier error que devuelva la API. */
export function errorMessage(cause: unknown, fallback = "Ocurrió un error inesperado") {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === "string") return cause;
  return fallback;
}
