/**
 * Whether the admin pages exist on this machine.
 *
 * Admin pages have no password and need none, because they are not meant to be
 * on the public site at all: they run where the person running the site works,
 * and nowhere else. (None exists since 21 October 2026, when /admin/categorias
 * was retired; see src/proxy.ts.)
 *
 * FAILS CLOSED. Admin is off unless `ADMIN_ENABLED` is exactly "true", so a
 * server that was never configured is safe by default. Forgetting the variable
 * on the VPS costs nothing; forgetting the opposite - a flag that defaults ON
 * and has to be switched off - would publish a page where anyone could refile
 * the whole menu.
 *
 * Read through a function rather than a constant so it is evaluated per
 * request. A module-level constant is fixed when the process starts, which
 * makes the setting untestable and surprising after a config change.
 */
export function adminEnabled(): boolean {
  return process.env.ADMIN_ENABLED === "true";
}
