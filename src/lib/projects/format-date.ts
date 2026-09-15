export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long", timeStyle: "short", timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
}
