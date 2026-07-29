import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode
} from "react";

type RouterValue = {
  path: string;
  navigate: (path: string, replace?: boolean) => void;
};

const RouterContext = createContext<RouterValue | null>(null);

export function Router({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const value = useMemo<RouterValue>(
    () => ({
      path,
      navigate: (next, replace = false) => {
        window.history[replace ? "replaceState" : "pushState"]({}, "", next);
        setPath(next);
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    }),
    [path]
  );
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export const useRouter = () => useContext(RouterContext)!;

export function AppLink({
  href,
  active,
  className,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  active?: boolean;
}) {
  const { navigate } = useRouter();
  function click(event: MouseEvent<HTMLAnchorElement>) {
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) {
      event.preventDefault();
      navigate(href);
    }
  }
  return (
    <a {...props} href={href} onClick={click} className={`${className ?? ""}${active ? " active" : ""}`}>
      {children}
    </a>
  );
}
