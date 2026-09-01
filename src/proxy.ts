import { NextResponse } from "next/server";
import { adminEnabled } from "@/lib/admin";

/**
 * Keeps the admin pages off the public site.
 *
 * `/admin/categorias` has no password. It does not need one, because it is not
 * meant to be reachable from the internet: it runs where the site is
 * maintained, and the public server simply does not serve it.
 *
 * Answers 404, not 403 and not a redirect. A refusal confirms the page is
 * there; a 404 is indistinguishable from a route that was never built, which is
 * what we want a stranger to see.
 *
 * This is the outer layer only. Next's own documentation is explicit that Proxy
 * is for optimistic checks and "should not be used as a full session management
 * or authorization solution", so the same test is repeated inside the Server
 * Action that writes - see src/app/admin/categorias/actions.ts. The page and
 * the mutation are protected separately, because a Server Action is a POST and
 * a POST does not have to come from the page it belongs to.
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
