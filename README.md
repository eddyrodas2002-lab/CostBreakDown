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

A photo, or a PDF that is only a scan, downloads a reader the first time so the words can be recognized on this device. That step needs a connection. After that, photos and scans are read in the browser. A PDF that already contains text is read without that download. Each item name and price is pulled out and categorized, including when the price sits on the next line or in its own column. A Costco myaccount printout is read the same way: warehouse items keep their names and prices, and a fuel invoice keeps the pump, gallons, and sale amount. Pasting the receipt text does not need the download either.

## How a trip gets in

1. **Add a receipt** from Home, or the Add receipt button.
2. Choose a photo or a PDF, paste the receipt text, or type the items yourself.
3. Check the lines. Fix a name, price, or category if something looks off.
4. Save. The trip is written to `data/receipts` as a JSON file named with the date and id. If you started from a PDF or photo, that original file is saved beside it. The year’s totals update.

A sample receipt is on the empty home screen if you want to click around first. Delete it whenever you like.

## What the screens show

**Home** is the summary. The big number is what you’re on pace to get back by December 31. Under it: grocery rewards so far, grocery rewards by year end, and the latest trips.

**Plan** is the list to buy before you go. It finds the foods that show up trip after trip, lets you edit quantities, and prices them at what you paid most recently so rising prices are in the budget. Gas is part of each trip. A bar graph and a pie chart split spending into food, clothes, gas, and everything else. Enter your paycheck and the price at another gas station to see what’s left and what Costco gas saved.

**Receipts** lists every saved trip by date, and lists the file names in the receipt folder. Switch between newest and oldest, filter by year, open the saved items to see the name, quantity, price, and category that were stored, and delete a receipt from the folder. Open one for the original PDF or photo next to the category breakdown and the black card and Visa share for that visit. Receipts saved earlier can have the original file added from that page.

**Categories** is the cart as a whole: trips, what you paid, groceries, and rewards, plus a bar for each category. Pump, gallons, and other fuel words are counted as gas. Tap a category to see its spending. Week, 2 weeks, month, quarter, 6 months, year, and year-to-date each show how many times you went, what you spent, and whether that is up or down from the stretch before it.

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

While `npm run dev` or `npm run preview` is running, saving a receipt writes a file in `data/receipts`, and the original PDF or photo is saved next to it. Settings go in `data/settings.json`. The Receipts screen lists those file names. You can also open that folder and see every trip. Those files stay on this computer and are not committed to git, so they stay out of the project file list.

In Settings you can download a JSON backup, restore one, or erase the receipts. Erasing receipts removes the files from the folder and leaves the card toggles and pace as they are.
