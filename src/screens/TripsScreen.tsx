import { useMemo, useState } from "react";
import { TripCard } from "../components/TripCard";
import { useStore } from "../lib/store";

export function TripsScreen({ onOpen, onAdd }: { onOpen: (id: string) => void; onAdd: () => void }) {
  const { receipts, settings } = useStore();
  const [query, setQuery] = useState("");
  const trips = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...receipts]
      .filter((receipt) => {
        if (!needle) return true;
        const haystack = [receipt.warehouse, receipt.purchasedAt, ...receipt.items.map((item) => item.description)]
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      })
      .sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || b.createdAt.localeCompare(a.createdAt));
  }, [receipts, query]);

  return (
    <div className="stack">
      <label className="search">
        <span>Search trips</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Eggs, gas, Seattle…" />
      </label>
      {receipts.length === 0 ? (
        <section className="panel empty-panel">
          <h2>No trips yet</h2>
          <p>Each receipt you save shows up here on its own, with groceries and rewards for that visit.</p>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            Add a receipt
          </button>
        </section>
      ) : trips.length === 0 ? (
        <section className="panel">
          <h2>Nothing matches “{query.trim()}”</h2>
          <p className="help">Try an item name, a city, or part of the date.</p>
        </section>
      ) : (
        trips.map((receipt) => (
          <TripCard key={receipt.id} receipt={receipt} settings={settings} onOpen={() => onOpen(receipt.id)} />
        ))
      )}
    </div>
  );
}
