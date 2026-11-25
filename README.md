# Addons sales dashboard

Local dashboard for PrestaShop Addons seller sales (orders, KPIs).

## Run

```sh
bun install
bun run dev
```

Open http://localhost:3000. Needs `API_KEY` (Addons seller API key) in `.env`.

- `/api/sales` – full order history from 2015, cached 15 min (`?refresh=1` forces reload)
- `/api/products` – product names, cached 15 min
