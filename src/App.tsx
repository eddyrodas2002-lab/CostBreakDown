import { useEffect, useState } from "react";
import { Shell, type Tab } from "./components/Shell";
import { useStore } from "./lib/store";
import { CategoriesScreen } from "./screens/CategoriesScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { NewReceiptScreen } from "./screens/NewReceiptScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TripScreen } from "./screens/TripScreen";
import { TripsScreen } from "./screens/TripsScreen";

type Route =
  | { name: "home" }
  | { name: "trips" }
  | { name: "trip"; id: string }
  | { name: "categories" }
  | { name: "settings" }
  | { name: "new" };

function parseRoute(hash: string): Route {
  const path = (hash.replace(/^#/, "") || "/").split("?")[0];
  if (path === "/trips") return { name: "trips" };
  if (path.startsWith("/trip/")) return { name: "trip", id: decodeURIComponent(path.slice("/trip/".length)) };
  if (path === "/categories") return { name: "categories" };
  if (path === "/settings") return { name: "settings" };
  if (path === "/new") return { name: "new" };
  return { name: "home" };
}

function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [hash]);

  function navigate(path: string) {
    const next = `#${path.startsWith("/") ? path : `/${path}`}`;
    if ((window.location.hash || "#/") === next) setHash(next);
    else window.location.hash = next;
  }

  return { route: parseRoute(hash), navigate };
}

const TITLES: Record<Route["name"], string> = {
  home: "Home",
  trips: "Trips",
  trip: "Trip",
  categories: "Categories",
  settings: "Settings",
  new: "Add a receipt",
};

export function App() {
  const { route, navigate } = useRoute();
  const { draft, status, beginNew, beginSample, beginEdit } = useStore();
  const tab: Tab | null = route.name === "trip" || route.name === "new" ? (route.name === "new" ? null : "trips") : route.name;

  function abandonDraft(): boolean {
    const dirty = draft?.items.some((item) => item.description.trim() || item.amount !== 0);
    if (dirty && !window.confirm("Leave without saving this receipt?")) return false;
    beginNew();
    return true;
  }

  function addReceipt() {
    if (route.name === "new") {
      if (!abandonDraft()) return;
    } else {
      beginNew();
    }
    navigate("/new");
  }

  function openSample() {
    if (route.name === "new" && !abandonDraft()) return;
    beginSample();
    navigate("/new");
  }

  function go(path: string) {
    if (route.name === "new" && path !== "/new" && !abandonDraft()) return;
    navigate(path);
  }

  let body = (
    <HomeScreen onOpen={(id) => navigate(`/trip/${id}`)} onAdd={addReceipt} onSample={openSample} />
  );
  if (route.name === "trips") body = <TripsScreen onOpen={(id) => navigate(`/trip/${id}`)} onAdd={addReceipt} />;
  if (route.name === "trip") {
    body = (
      <TripScreen
        id={route.id}
        onEdit={() => {
          beginEdit(route.id);
          navigate("/new");
        }}
        onDeleted={() => navigate("/trips")}
      />
    );
  }
  if (route.name === "categories") body = <CategoriesScreen onOpen={(id) => navigate(`/trip/${id}`)} />;
  if (route.name === "settings") body = <SettingsScreen />;
  if (route.name === "new") body = <NewReceiptScreen onSaved={(id) => navigate(`/trip/${id}`)} onSample={openSample} />;

  if (status === "loading") {
    return (
      <div className="loading-screen">
        <section className="panel">
          <h2>Opening your receipt folder…</h2>
          <p className="help">Trips are loaded from the files saved on this computer.</p>
        </section>
      </div>
    );
  }

  return (
    <Shell
      tab={tab}
      title={TITLES[route.name]}
      focus={route.name === "new"}
      onNavigate={go}
      onAdd={addReceipt}
    >
      {status === "offline" && (
        <p className="banner warn">
          The receipt folder isn’t available, so this visit stays in the browser. Run npm run dev to save files into data/receipts.
        </p>
      )}
      {body}
    </Shell>
  );
}
