// Re-export shim so existing integration imports keep working while the
// canonical implementation lives in `tests/_helpers/session.ts` (shared with
// the E2E suite).
export {
  type TestUser,
  createSignedInUser,
  accessTokenFromCookie,
  countOwnTransactions,
  deleteUser,
} from "../../_helpers/session";
