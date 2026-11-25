# Addons sales dashboard

Local dashboard for PrestaShop Addons seller sales (orders, KPIs).

Needs `API_KEY` (Addons seller API key) in `.env` (copy `.env.example`).

## Prebuilt install

Download `addons-dashboard.zip` from [Releases](https://github.com/unlocomqx/addons-dashboard/releases/latest), unzip it under your Apache document root, copy `.env.example` to `.env` and set `API_KEY`. No build needed.

## Run with Apache + PHP (no server process)

```sh
bun install
bun run build
```

Place the repo under the Apache document root (with `AllowOverride All`, mod_rewrite, PHP + curl) and open it, e.g. http://localhost/prestashop/dashboard/.

- `.htaccess` serves `dist/` and blocks everything else (`.env`, `src/`, `cache/`).
- `api.php` proxies the Addons API, cached 15 min in `cache/` (`?refresh=1` forces reload).
- Run `bun run build` again after editing `src/`.

## Run with Bun

```sh
bun run dev
```

Open http://localhost:3000.
