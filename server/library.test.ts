import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLibrary, readOriginal, receiptFileName, writeLibrary, writeOriginal, type StoredReceipt, type StoredSettings } from "./library";

const roots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "costbreak-"));
  roots.push(root);
  return root;
}

function settings(partial: Pick<StoredSettings, "blackCard" | "costcoVisa" | "pace">): StoredSettings {
  return {
    payAmount: 0,
    payCadence: "biweekly",
    planCadence: "biweekly",
    nearbyGasPrice: 0,
    necessary: [],
    ...partial,
  };
}

function receipt(id: string, purchasedAt: string): StoredReceipt {
  return {
    id,
    purchasedAt,
    warehouse: "Seattle, WA",
    items: [{ description: "EGGS", amount: 8.79 }],
    tax: 0,
    total: 8.79,
    createdAt: `${purchasedAt}T12:00:00.000Z`,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("receipt folder", () => {
  it("writes one json file per receipt and reads them back", () => {
    const root = makeRoot();
    const first = receipt("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "2026-09-21");
    const second = receipt("bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee", "2026-10-02");
    writeLibrary(root, {
      settings: settings({ blackCard: true, costcoVisa: false, pace: "weekly" }),
      receipts: [first, second],
    });

    const saved = fs.readdirSync(path.join(root, "data", "receipts")).sort();
    expect(saved).toEqual([receiptFileName(first), receiptFileName(second)].sort());

    const library = readLibrary(root);
    expect(library.receipts.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(library.settings.costcoVisa).toBe(false);
    expect(library.settings.pace).toBe("weekly");
    expect(library.folder).toBe(path.join(root, "data", "receipts"));
  });

  it("renames a file when the trip date changes and drops deleted trips", () => {
    const root = makeRoot();
    const original = receipt("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "2026-09-21");
    writeLibrary(root, {
      settings: settings({ blackCard: true, costcoVisa: true, pace: "auto" }),
      receipts: [original],
    });
    const moved = { ...original, purchasedAt: "2026-10-01" };
    writeLibrary(root, {
      settings: settings({ blackCard: true, costcoVisa: true, pace: "auto" }),
      receipts: [moved],
    });

    const names = fs.readdirSync(path.join(root, "data", "receipts"));
    expect(names).toEqual([receiptFileName(moved)]);

    writeLibrary(root, {
      settings: settings({ blackCard: false, costcoVisa: true, pace: "monthly" }),
      receipts: [],
    });
    expect(fs.readdirSync(path.join(root, "data", "receipts"))).toEqual([]);
    expect(readLibrary(root).settings.blackCard).toBe(false);
  });

  it("keeps the original pdf beside the receipt and removes it with the trip", () => {
    const root = makeRoot();
    const trip = receipt("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "2026-09-15");
    writeLibrary(root, {
      settings: settings({ blackCard: true, costcoVisa: true, pace: "auto" }),
      receipts: [trip],
    });
    const sourceFile = writeOriginal(root, trip.id, Buffer.from("%PDF-1.4 sample"), "application/pdf");
    expect(sourceFile).toBe("2026-09-15_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf");

    const library = readLibrary(root);
    expect(library.files).toEqual([
      "2026-09-15_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json",
      "2026-09-15_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf",
    ]);
    expect(library.receipts[0].sourceFile).toBe(sourceFile);
    expect(readOriginal(root, trip.id)?.type).toBe("application/pdf");

    const moved = { ...trip, purchasedAt: "2026-10-01" };
    writeLibrary(root, {
      settings: settings({ blackCard: true, costcoVisa: true, pace: "auto" }),
      receipts: [moved],
    });
    expect(readLibrary(root).files).toEqual([
      "2026-10-01_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.json",
      "2026-10-01_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf",
    ]);

    writeLibrary(root, {
      settings: settings({ blackCard: true, costcoVisa: true, pace: "auto" }),
      receipts: [],
    });
    expect(readLibrary(root).files).toEqual([]);
    expect(readOriginal(root, trip.id)).toBeNull();
  });
});
