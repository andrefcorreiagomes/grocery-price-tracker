import { NextResponse } from "next/server";
import { adminEnabled } from "@/lib/admin";

/**
 * Keeps the admin pages off the public site.
 *
 * There are none at the moment: the only one, /admin/categorias (filing kinds
 * of food under menu headings), was retired on 21 October 2026 when the menu
 * came to be read from data/food-tree.ts. The guard stays so that any future
 * admin page is off the public site by default, as the user decided.
 *
 * Admin pages have no password. They do not need one, because they are not
 * meant to be reachable from the internet: they run where the site is
 * maintained, and the public server simply does not serve them.
 *
 * Answers 404, not 403 and not a redirect. A refusal confirms the page is
 * there; a 404 is indistinguishable from a route that was never built, which is
 * what we want a stranger to see.
 *
 * This is the outer layer only. Next's own documentation is explicit that Proxy
 * is for optimistic checks and "should not be used as a full session management
 * or authorization solution", so an admin page's Server Actions must repeat the
 * same test (as /admin/categorias's did, with adminEnabled()). The page and the
 * mutation are protected separately, because a Server Action is a POST and a
 * POST does not have to come from the page it belongs to.
 */
export function proxy() {
  if (!adminEnabled()) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  // Only the admin tree. Everything else - the comparison pages, the
  // categories, the static files - is untouched, so nothing public pays for
  // this check.
  matcher: "/admin/:path*",
};
