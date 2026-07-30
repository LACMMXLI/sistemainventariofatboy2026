import { useEffect, useRef } from "react";
import { registerSW } from "virtual:pwa-register";
import { useToast } from "./toast";

/** Revisión periódica mientras la aplicación está abierta. */
const CHECK_INTERVAL = 60 * 60 * 1000;
/** Piso entre revisiones, para no consultar en cada cambio de pestaña. */
const MIN_GAP = 5 * 60 * 1000;

/** El service worker se registra una sola vez por carga, aunque React remonte. */
let started = false;

/**
 * Mantiene la aplicación al día.
 *
 * El frontend queda precacheado, así que las aperturas siguientes cargan del
 * disco. En paralelo se consulta al servidor si hay una versión nueva: al
 * abrir, al volver a la pestaña, al recuperar la señal y cada hora. Cuando la
 * hay, se descarga en segundo plano y se avisa; el cambio se aplica cuando el
 * usuario acepta, nunca a media captura.
 */
export function PwaUpdater() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (started || !("serviceWorker" in navigator)) return;
    started = true;

    let lastCheck = Date.now();
    let cleanup: (() => void) | undefined;

    const updateSW = registerSW({
      immediate: true,

      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;

        const check = (force = false) => {
          if (!force && Date.now() - lastCheck < MIN_GAP) return;
          if (!navigator.onLine) return;
          lastCheck = Date.now();
          // Si falla (sin red, servidor caído) se reintenta en la siguiente ronda.
          registration.update().catch(() => undefined);
        };

        check(true);

        const timer = setInterval(() => check(), CHECK_INTERVAL);
        const onVisible = () => document.visibilityState === "visible" && check();
        const onOnline = () => check(true);

        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("online", onOnline);

        cleanup = () => {
          clearInterval(timer);
          document.removeEventListener("visibilitychange", onVisible);
          window.removeEventListener("online", onOnline);
        };
      },

      onNeedRefresh() {
        toastRef.current.info({
          key: "actualizacion",
          title: "Nueva versión disponible",
          detail: "Ya se descargó. Aplícala cuando termines lo que estás capturando.",
          duration: 0,
          action: { label: "Actualizar ahora", onClick: () => void updateSW(true) }
        });
      },

      onOfflineReady() {
        toastRef.current.success({
          key: "offline-listo",
          title: "Listo para trabajar sin conexión",
          detail: "El sistema quedó guardado en este dispositivo."
        });
      }
    });

    return () => cleanup?.();
  }, []);

  return null;
}
