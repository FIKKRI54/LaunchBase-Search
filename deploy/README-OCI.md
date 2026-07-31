# OCI single-instance deployment

These files keep the public web server, static React build, Node API and PostgreSQL on one small Oracle Linux or Ubuntu instance. Nginx serves versioned assets directly and proxies only `/api` to Node.

## Recommended layout

- Application: `/opt/launchbase`
- React build: `/opt/launchbase/dist`
- Node API: `127.0.0.1:8787`
- Nginx: ports `80` and `443`
- PostgreSQL: local socket or `127.0.0.1:5432`
- Domain: `laubase.xyz` and optionally `www.laubase.xyz`

## Deployment sequence

1. Point the domain's `A` records to the instance's reserved public IP.
2. In the OCI network security list and the instance firewall, allow inbound TCP `22`, `80`, and `443`. Do not expose PostgreSQL or port `8787`.
3. Install Node.js 20+, PostgreSQL, Nginx and Certbot.
4. Create a non-login `launchbase` system user and place the project in `/opt/launchbase`.
5. Copy `.env.example` to `.env` and set:

   ```text
   NODE_ENV=production
   HOST=127.0.0.1
   TRUST_PROXY=true
   CLIENT_ORIGIN=https://laubase.xyz,https://www.laubase.xyz
   DATABASE_URL=postgresql://launchbase:CHANGE_ME@127.0.0.1:5432/launchbase
   DATABASE_SSL=false
   OSM_USER_AGENT=LaunchBaseSearch/1.0 (admin@laubase.xyz)
   ```

6. Install only locked dependencies, migrate and build:

   ```bash
   npm ci
   npm run db:migrate
   npm run build
   npm prune --omit=dev
   ```

7. Install the supplied service and Nginx configuration:

   ```bash
   sudo cp deploy/launchbase.service /etc/systemd/system/
   sudo cp deploy/nginx-launchbase.conf /etc/nginx/conf.d/launchbase.conf
   sudo systemctl daemon-reload
   sudo systemctl enable --now launchbase
   sudo nginx -t
   sudo systemctl reload nginx
   ```

8. Issue the TLS certificate only after DNS resolves:

   ```bash
   sudo certbot --nginx -d laubase.xyz -d www.laubase.xyz
   ```

9. Verify:

   ```bash
   curl https://laubase.xyz/api/health
   systemctl status launchbase
   journalctl -u launchbase -n 100 --no-pager
   ```

## Updating

Copy or pull the new source into `/opt/launchbase`, then run:

```bash
npm ci
npm run db:migrate
npm run build
npm prune --omit=dev
sudo systemctl restart launchbase
```

Keep `.env`, PostgreSQL dumps and TLS keys outside source control. Schedule a daily PostgreSQL backup and monitor disk, memory, API latency and HTTP 429/5xx rates.
