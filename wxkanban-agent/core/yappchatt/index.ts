// [SCOPE 102 / T001] BEGIN — YappChatt core module barrel
// MODIFIED-BY: [SCOPE 150 / T003] — exports the in-memory connection type (FR-011)
export {
  YappchattClient,
  resolveYappchattConfig,
  YappchattConfigError,
  type YappchattConfig,
  type YappchattUser,
  type YappchattStatus,
  type YappchattMessage,
  type YappchattHandlers,
  type YappchattResolved,
  type YappchattConnection,
  type FetchImpl,
  type SocketFactory,
} from "./client";
// [SCOPE 102 / T001] END
