const INTERNAL_DOMAIN = "students.pathgenius.local";
export function loginIdToAuthEmail(loginId: string): string {
  return `${loginId.trim().toLowerCase()}@${INTERNAL_DOMAIN}`;
}
