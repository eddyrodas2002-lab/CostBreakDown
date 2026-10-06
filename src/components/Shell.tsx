import type { ReactNode } from "react";

export type Tab = "home" | "trips" | "categories" | "settings";

export function Shell({
  tab,
  title,
  focus,
  onNavigate,
  onAdd,
  children,
}: {
  tab: Tab | null;
  title: string;
  focus?: boolean;
  onNavigate: (path: string) => void;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <div className={focus ? "app focus-mode" : "app"}>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <aside className="rail">
        <button type="button" className="brand" onClick={() => onNavigate("/")}>
          <span className="logo-mark" aria-hidden="true">
            CB
          </span>
          <span>
            <strong>CostBreak</strong>
            <small>Costco receipts, clearly</small>
          </span>
        </button>
        <nav className="rail-nav" aria-label="Main">
          <RailLink active={tab === "home"} onClick={() => onNavigate("/")}>
            Home
          </RailLink>
          <RailLink active={tab === "trips"} onClick={() => onNavigate("/trips")}>
            Trips
          </RailLink>
          <RailLink active={tab === "categories"} onClick={() => onNavigate("/categories")}>
            Categories
          </RailLink>
          <RailLink active={tab === "settings"} onClick={() => onNavigate("/settings")}>
            Settings
          </RailLink>
        </nav>
        <button type="button" className="btn btn-primary rail-add" onClick={onAdd}>
          Add a receipt
        </button>
      </aside>
      <div className="stage">
        <header className="topbar">
          <div className="topbar-title">
            <p className="brand-inline">CostBreak</p>
            <h1>{title}</h1>
          </div>
          {focus ? (
            <button type="button" className="btn btn-ghost" onClick={() => onNavigate("/trips")}>
              Close
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onAdd}>
              Add receipt
            </button>
          )}
        </header>
        <main id="content">{children}</main>
      </div>
      {!focus && (
        <nav className="tabbar" aria-label="Main">
          <TabButton active={tab === "home"} label="Home" onClick={() => onNavigate("/")}>
            <HomeIcon />
          </TabButton>
          <TabButton active={tab === "trips"} label="Trips" onClick={() => onNavigate("/trips")}>
            <ReceiptIcon />
          </TabButton>
          <TabButton active={tab === "categories"} label="Categories" onClick={() => onNavigate("/categories")}>
            <ChartIcon />
          </TabButton>
          <TabButton active={tab === "settings"} label="Settings" onClick={() => onNavigate("/settings")}>
            <GearIcon />
          </TabButton>
        </nav>
      )}
    </div>
  );
}

function RailLink({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={active ? "rail-link active" : "rail-link"} aria-current={active ? "page" : undefined} onClick={onClick}>
      {children}
    </button>
  );
}

function TabButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={active ? "tab active" : "tab"} aria-current={active ? "page" : undefined} onClick={onClick}>
      {children}
      <span>{label}</span>
    </button>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function ReceiptIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h10a1 1 0 0 1 1 1v17l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L6 21V4a1 1 0 0 1 1-1z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 19h16" />
      <path d="M7 16V9M12 16V5M17 16v-4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6" />
    </svg>
  );
}
