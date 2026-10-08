# CostBreak

A bright, simple way to break down Costco receipts. Add a trip, see the cart by category, and estimate what the Executive black card and the Costco Visa put back in your pocket by the end of the year.

Receipts are saved as files in `data/receipts` on this computer. Nothing is sent to an account.

## Run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app locally |
| `npm test` | Check receipt reading and reward math |
| `npm run build` | Typecheck and build the production files |
| `npm run preview` | Serve the production build locally |

The first receipt photo downloads a reader so the words can be recognized on this device. That step needs a connection. After that, photos are read in the browser. Pasting the receipt text does not need the download.

## How a trip gets in

1. **Add a receipt** from Home, or the Add receipt button.
2. Choose a photo, paste the receipt text, or type the items yourself.
3. Check the lines. Fix a name, price, or category if something looks off.
4. Save. The trip is written to `data/receipts` as a JSON file named with the date and id, and the year’s totals update.

A sample receipt is on the empty home screen if you want to click around first. Delete it whenever you like.

## What the screens show

**Home** is the summary. The big number is what you’re on pace to get back by December 31. Under it: grocery rewards so far, grocery rewards by year end, and the latest trips.

**Trips** lists every receipt. Open one to see items grouped by category, with the black card and Visa share for that visit.

**Categories** is the cart as a whole: trips, what you paid, groceries, and rewards, plus a bar for each category. Tap a category to list just those trips. Switch between this year and all saved trips.

**Settings** turns each card on or off. Totals everywhere update immediately. The **i** next to a card explains how that reward is counted.

The year-end guess has four paces:

- **From my trips** keeps the spending pace since your first trip this year. Quiet days count as no shopping.
- **Weekly**, **Every 2 weeks**, and **Monthly** repeat your average trip on that rhythm through December.

A guess from only a trip or two is marked **Early estimate**.

## How the rewards are counted

These are estimates from the receipts saved here, before tax.

**Black card** is the Executive membership 2% reward.

- It applies to most warehouse merchandise.
- Gas, the food court, membership fees, and taxes are left out.
- The reward stops at $1,250 for the year.
- The Executive upgrade costs $65 more than Gold Star. That $65 is covered once eligible shopping reaches about $3,250.

**Costco Visa** is the Costco Anywhere Visa by Citi.

- 2% on Costco merchandise.
- 5% on gas bought at Costco, up to $7,000 of gas, then 1%.
- The 2% warehouse rate is not capped.
- With the black card also on, groceries come back at 4%.

## Your data

While `npm run dev` or `npm run preview` is running, saving a receipt writes a file in `data/receipts`. Settings go in `data/settings.json`. You can open that folder and see every trip. Those files stay on this computer and are not committed to git.

In Settings you can download a JSON backup, restore one, or erase the receipts. Erasing receipts removes the files from the folder and leaves the card toggles and pace as they are.
