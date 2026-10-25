<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Every assumption is written down (the owner's rule, 25 October 2026)

At every step - reading a store's pages, writing or changing code, planning,
or explaining how something works - ask: **what am I taking as true here
without having proved it?** Be highly critical. Each answer goes into
`docs/assumptions.md` (private, never uploaded) in the same piece of work:
what we assume, why, how it could be wrong, how we would notice, and its
status (open / checked with date and figures / known gap / false). Never
leave one for later. When a test or a measurement touches an assumption,
update its row with the date and the figures.

Every assumption is re-tested once a month; where a full test is
impractical, a sample is tested and the result stated as a confidence (for
example "95% sure, from a sample of 300").
