// [SCOPE 102 / T001] BEGIN — YappChatt core module barrel
// MODIFIED-BY: [SCOPE 150 / T003] — exports the in-memory connection type (FR-011)
// MODIFIED-BY: [SCOPE 144 / T024] — exports the Room Link status types and the alert threshold (FR-016, FR-017)
export {
  YappchattClient,
  resolveYappchattConfig,
  YappchattConfigError,
  ROOM_LINK_ALERT_FAILURES,
  type RoomLinkInfo,
  type RoomLinkState,
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
