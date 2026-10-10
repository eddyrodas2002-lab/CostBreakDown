import { useState } from "react";
import { PacePicker } from "../components/PacePicker";
import { ToggleRow } from "../components/ToggleRow";
import { PACE_HELP } from "../lib/savings";
import { isBackup, useStore } from "../lib/store";

export function SettingsScreen() {
  const { settings, receipts, folder, updateSettings, replaceAll } = useStore();
  const [message, setMessage] = useState("");

  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ version: 1, settings, receipts }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "costbreak-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Backup downloaded.");
  }

  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isBackup(parsed)) {
        setMessage("That file isn’t a CostBreak backup.");
        return;
      }
      const ok = window.confirm("Replace the receipts and settings in this browser with the backup?");
      if (!ok) return;
      replaceAll(parsed);
      setMessage(`Restored ${parsed.receipts.length} receipts.`);
    } catch {
      setMessage("That file couldn’t be read.");
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Reward programs</h2>
        <p className="help">Turn these on for the cards you actually use. Every total on Home and Categories updates right away.</p>
        <ToggleRow
          on={settings.blackCard}
          title="Black card"
          detail="Executive membership, 2% reward"
          info={[
            "Costco pays about 2% back on most warehouse merchandise, before tax. Gas, the food court, membership fees, and taxes are not included. The reward tops out at $1,250 a year.",
            "The Executive upgrade costs $65 more than Gold Star. That $65 is covered once eligible shopping reaches about $3,250.",
          ]}
          onChange={(blackCard) => updateSettings({ blackCard })}
        />
        <ToggleRow
          on={settings.costcoVisa}
          title="Costco Visa"
          detail="Costco Anywhere Visa by Citi"
          info={[
            "2% back on Costco merchandise and 5% on gas bought at Costco. After $7,000 of gas, that gas rate drops to 1%. There isn’t a cap on the 2% warehouse rate.",
            "With the black card also on, groceries come back at 4%.",
          ]}
          onChange={(costcoVisa) => updateSettings({ costcoVisa })}
        />
      </section>

      <section className="panel">
        <h2>Year-end guess</h2>
        <p className="help">{PACE_HELP[settings.pace]}</p>
        <PacePicker value={settings.pace} onChange={(pace) => updateSettings({ pace })} />
      </section>

      <section className="panel">
        <h2>Saved on this computer</h2>
        <p className="help">
          Each trip is a file in the receipt folder, and its PDF or photo is stored beside it. Nothing is sent to an account. {receipts.length}{" "}
          {receipts.length === 1 ? "receipt is" : "receipts are"} saved there. Download a backup if you want another copy.
        </p>
        <code className="code-path">{folder}</code>
        {message && <p className="banner">{message}</p>}
        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={downloadBackup}>
            Download backup
          </button>
          <label className="btn btn-sun">
            Restore backup
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(event) => {
                void restoreBackup(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm("Erase every receipt saved in this browser? Settings stay as they are.")) {
                replaceAll({ version: 1, settings, receipts: [] });
                setMessage("Receipts erased.");
              }
            }}
          >
            Erase receipts
          </button>
        </div>
      </section>
    </div>
  );
}
