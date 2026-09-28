export const pages = ["Home", "Sessions", "Boards", "Goals", "ChatGPT"];

export function readRoute(href) {
  const params = new URL(href).searchParams;
  const page = pages.find((name) => name.toLowerCase() === params.get("page"));
  const sessionId = params.get("session") || null;
  return { page: page || (sessionId ? "Sessions" : "Home"), sessionId };
}

export function routeUrl(href, route) {
  const url = new URL(href);
  url.searchParams.set("page", route.page.toLowerCase());
  if (route.sessionId) url.searchParams.set("session", route.sessionId);
  else url.searchParams.delete("session");
  return url;
}
