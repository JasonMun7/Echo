/**
 * Curated Composio tool slugs with human labels (Zapier-style picker in the workflow editor).
 * Composio may add or rename tools; unknown slugs can still be typed manually.
 */
export type ComposioToolCatalogEntry = {
  slug: string;
  title: string;
  description: string;
  category: string;
};

export const COMPOSIO_TOOL_CATEGORIES = [
  "All",
  "Slack",
  "Gmail",
  "GitHub",
  "Google Calendar",
  "Google Drive",
  "Google",
] as const;

export const COMPOSIO_TOOL_CATALOG: ComposioToolCatalogEntry[] = [
  {
    slug: "SLACK_SEND_MESSAGE",
    title: "Slack — Send message",
    description: "Post to a channel or DM",
    category: "Slack",
  },
  {
    slug: "SLACK_LIST_ALL_CHANNELS",
    title: "Slack — List channels",
    description: "List workspace channels",
    category: "Slack",
  },
  {
    slug: "GMAIL_SEND_EMAIL",
    title: "Gmail — Send email",
    description: "Send an email from your connected account",
    category: "Gmail",
  },
  {
    slug: "GMAIL_LIST_LABELS",
    title: "Gmail — List labels",
    description: "List mailbox labels",
    category: "Gmail",
  },
  {
    slug: "GITHUB_CREATE_ISSUE",
    title: "GitHub — Create issue",
    description: "Open a new issue in a repository",
    category: "GitHub",
  },
  {
    slug: "GITHUB_LIST_REPOSITORIES_FOR_THE_AUTHENTICATED_USER",
    title: "GitHub — List my repositories",
    description: "Repositories for the authenticated user",
    category: "GitHub",
  },
  {
    slug: "GOOGLECALENDAR_CALENDAR_LIST",
    title: "Google Calendar — List calendars",
    description: "Calendars on the connected account",
    category: "Google Calendar",
  },
  {
    slug: "GOOGLECALENDAR_FREEBUSY_QUERY",
    title: "Google Calendar — Free/busy query",
    description: "Query free/busy windows",
    category: "Google Calendar",
  },
  {
    slug: "GOOGLEDRIVE_LIST_FILES",
    title: "Google Drive — List files",
    description: "List or search files in Drive",
    category: "Google Drive",
  },
  {
    slug: "GOOGLEGET_USER_INFO",
    title: "Google — Get profile",
    description: "Userinfo / profile for the connected Google account",
    category: "Google",
  },
];

export function filterComposioToolCatalog(
  query: string,
  category: (typeof COMPOSIO_TOOL_CATEGORIES)[number],
): ComposioToolCatalogEntry[] {
  const q = query.trim().toLowerCase();
  return COMPOSIO_TOOL_CATALOG.filter((e) => {
    if (category !== "All" && e.category !== category) return false;
    if (!q) return true;
    const hay = `${e.title} ${e.description} ${e.slug}`.toLowerCase();
    return hay.includes(q);
  });
}
