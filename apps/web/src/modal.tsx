import { useEffect, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";

type ModalProps = {
  title: string;
  description?: string;
  onClose: () => void;
  /** Si se pasa, el modal se renderiza como <form> y este es su submit. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Ancho del diálogo. `wide` para formularios de dos columnas. */
  size?: "default" | "wide";
  children: ReactNode;
  actions: ReactNode;
};

/**
 * Diálogo centrado en la ventana completa.
 *
 * Se monta en `document.body` mediante portal: dentro del árbol de la app hay
 * contenedores con `transform`, `filter` y `backdrop-filter`, y cualquiera de
 * ellos convierte a un `position: fixed` descendiente en relativo a sí mismo,
 * que es lo que descuadraba los formularios.
 */
export function Modal({
  title,
  description,
  onClose,
  onSubmit,
  size = "default",
  children,
  actions
}: ModalProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const panelProps = {
    className: `modal${size === "wide" ? " wide" : ""}`,
    role: "dialog",
    "aria-modal": true,
    "aria-label": title
  } as const;

  const inner = (
    <>
      <div className="modal-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
          <IconX size={18} />
        </button>
      </div>
      <div className="modal-body">{children}</div>
      <div className="modal-actions">{actions}</div>
    </>
  );

  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {onSubmit ? (
        <form {...panelProps} onSubmit={onSubmit}>{inner}</form>
      ) : (
        <div {...panelProps}>{inner}</div>
      )}
    </div>,
    document.body
  );
}
