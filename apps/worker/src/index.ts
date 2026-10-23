import { handleGetCharts } from "./routes/charts";
import { handleGetCapabilities } from "./routes/capabilities";
import { handlePostEventRooms } from "./routes/event-rooms";
import { handleGetChartAliasResolve } from "./routes/chart-aliases";
import { handlePostFeedback } from "./routes/feedback";
import { handleGetJoin } from "./routes/join";
import { handleGetLobby } from "./routes/lobby";
import {
  handleDeleteMatchmakingQueueTicket,
  handleGetMatchmakingWaitingCount,
  handleGetMatchmakingQueueTicket,
  handlePostMatchmakingQueue,
  matchMatchmakingQueueTicketPath,
} from "./routes/matchmaking";
import { handleGetRoomCharts, handlePostRooms, handleRoomWebSocket, matchRoomChartsPath, matchRoomWebSocketPath } from "./routes/rooms";
import { handleGetSongPacks } from "./routes/song-packs";
import { LobbyDirectoryDO } from "./durable/lobby-directory-object";
import { MatchmakingDurableObject } from "./durable/matchmaking-object";
import { RoomDurableObject } from "./durable/room-object";
import type { WorkerEnv } from "./types/env";
import { methodNotAllowed, noContent, notFound, withCors } from "./utils/http";

const CHARTS_ALLOWED_METHODS = ["GET"];
const CHART_ALIAS_RESOLVE_ALLOWED_METHODS = ["GET"];
const ROOMS_ALLOWED_METHODS = ["POST"];
const EVENT_ROOMS_ALLOWED_METHODS = ["POST"];
const CAPABILITIES_ALLOWED_METHODS = ["GET"];
const JOIN_ALLOWED_METHODS = ["GET"];
const LOBBY_ALLOWED_METHODS = ["GET"];
const FEEDBACK_ALLOWED_METHODS = ["POST"];
const SONG_PACKS_ALLOWED_METHODS = ["GET"];
const ROOM_CHARTS_ALLOWED_METHODS = ["GET"];
const MATCHMAKING_WAITING_COUNT_ALLOWED_METHODS = ["GET"];
const MATCHMAKING_QUEUE_ALLOWED_METHODS = ["POST"];
const MATCHMAKING_QUEUE_TICKET_ALLOWED_METHODS = ["GET", "DELETE"];

export { RoomDurableObject, LobbyDirectoryDO, MatchmakingDurableObject };

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const webSocketRoomId = matchRoomWebSocketPath(url.pathname);
    const chartRoomId = matchRoomChartsPath(url.pathname);
    const matchmakingQueueTicketId = matchMatchmakingQueueTicketPath(url.pathname);

    if (webSocketRoomId !== null) {
      return handleRoomWebSocket(request, env, webSocketRoomId);
    }

    if (chartRoomId !== null) {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, ROOM_CHARTS_ALLOWED_METHODS);
      }
      if (request.method === "GET") {
        return withCors(await handleGetRoomCharts(request, env, chartRoomId), request, ROOM_CHARTS_ALLOWED_METHODS);
      }

      return withCors(methodNotAllowed([...ROOM_CHARTS_ALLOWED_METHODS, "OPTIONS"]), request, ROOM_CHARTS_ALLOWED_METHODS);
    }

    if (url.pathname === "/api/matchmaking/queue") {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, MATCHMAKING_QUEUE_ALLOWED_METHODS);
      }
      if (request.method === "POST") {
        return withCors(await handlePostMatchmakingQueue(request, env), request, MATCHMAKING_QUEUE_ALLOWED_METHODS);
      }

      return withCors(
        methodNotAllowed([...MATCHMAKING_QUEUE_ALLOWED_METHODS, "OPTIONS"]),
        request,
        MATCHMAKING_QUEUE_ALLOWED_METHODS,
      );
    }

    if (url.pathname === "/api/matchmaking/waiting-count") {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, MATCHMAKING_WAITING_COUNT_ALLOWED_METHODS);
      }
      if (request.method === "GET") {
        return withCors(await handleGetMatchmakingWaitingCount(request, env), request, MATCHMAKING_WAITING_COUNT_ALLOWED_METHODS);
      }

      return withCors(
        methodNotAllowed([...MATCHMAKING_WAITING_COUNT_ALLOWED_METHODS, "OPTIONS"]),
        request,
        MATCHMAKING_WAITING_COUNT_ALLOWED_METHODS,
      );
    }

    if (matchmakingQueueTicketId !== null) {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, MATCHMAKING_QUEUE_TICKET_ALLOWED_METHODS);
      }
      if (request.method === "GET") {
        return withCors(
          await handleGetMatchmakingQueueTicket(request, env, matchmakingQueueTicketId),
          request,
          MATCHMAKING_QUEUE_TICKET_ALLOWED_METHODS,
        );
      }
      if (request.method === "DELETE") {
        return withCors(
          await handleDeleteMatchmakingQueueTicket(request, env, matchmakingQueueTicketId),
          request,
          MATCHMAKING_QUEUE_TICKET_ALLOWED_METHODS,
        );
      }

      return withCors(
        methodNotAllowed([...MATCHMAKING_QUEUE_TICKET_ALLOWED_METHODS, "OPTIONS"]),
        request,
        MATCHMAKING_QUEUE_TICKET_ALLOWED_METHODS,
      );
    }

    if (url.pathname === "/api/rooms") {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, ROOMS_ALLOWED_METHODS);
      }
      if (request.method === "POST") {
        return withCors(await handlePostRooms(request, env), request, ROOMS_ALLOWED_METHODS);
      }

      return withCors(methodNotAllowed([...ROOMS_ALLOWED_METHODS, "OPTIONS"]), request, ROOMS_ALLOWED_METHODS);
    }

    if (url.pathname === "/api/event-rooms") {
      if (request.method === "OPTIONS") return withCors(noContent(), request, EVENT_ROOMS_ALLOWED_METHODS);
      if (request.method === "POST") return withCors(await handlePostEventRooms(request, env), request, EVENT_ROOMS_ALLOWED_METHODS);
      return withCors(methodNotAllowed([...EVENT_ROOMS_ALLOWED_METHODS, "OPTIONS"]), request, EVENT_ROOMS_ALLOWED_METHODS);
    }

    if (url.pathname === "/api/capabilities") {
      if (request.method === "OPTIONS") return withCors(noContent(), request, CAPABILITIES_ALLOWED_METHODS);
      if (request.method === "GET") return withCors(handleGetCapabilities(env), request, CAPABILITIES_ALLOWED_METHODS);
      return withCors(methodNotAllowed([...CAPABILITIES_ALLOWED_METHODS, "OPTIONS"]), request, CAPABILITIES_ALLOWED_METHODS);
    }

    if (url.pathname === "/api/join") {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, JOIN_ALLOWED_METHODS);
      }
      if (request.method === "GET") {
        return withCors(await handleGetJoin(request, env), request, JOIN_ALLOWED_METHODS);
      }

      return withCors(methodNotAllowed([...JOIN_ALLOWED_METHODS, "OPTIONS"]), request, JOIN_ALLOWED_METHODS);
    }

    if (url.pathname === "/api/lobby") {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, LOBBY_ALLOWED_METHODS);
      }
      if (request.method === "GET") {
        return withCors(await handleGetLobby(request, env), request, LOBBY_ALLOWED_METHODS);
      }

      return withCors(methodNotAllowed([...LOBBY_ALLOWED_METHODS, "OPTIONS"]), request, LOBBY_ALLOWED_METHODS);
    }

    if (url.pathname === "/api/charts") {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, CHARTS_ALLOWED_METHODS);
      }
      if (request.method === "GET") {
        return withCors(await handleGetCharts(request), request, CHARTS_ALLOWED_METHODS);
      }

      return withCors(methodNotAllowed([...CHARTS_ALLOWED_METHODS, "OPTIONS"]), request, CHARTS_ALLOWED_METHODS);
    }

    if (url.pathname === "/api/chart-aliases/resolve") {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, CHART_ALIAS_RESOLVE_ALLOWED_METHODS);
      }
      if (request.method === "GET") {
        return withCors(await handleGetChartAliasResolve(request), request, CHART_ALIAS_RESOLVE_ALLOWED_METHODS);
      }

      return withCors(
        methodNotAllowed([...CHART_ALIAS_RESOLVE_ALLOWED_METHODS, "OPTIONS"]),
        request,
        CHART_ALIAS_RESOLVE_ALLOWED_METHODS,
      );
    }

    if (url.pathname === "/api/song-packs") {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, SONG_PACKS_ALLOWED_METHODS);
      }
      if (request.method === "GET") {
        return withCors(await handleGetSongPacks(request), request, SONG_PACKS_ALLOWED_METHODS);
      }

      return withCors(methodNotAllowed([...SONG_PACKS_ALLOWED_METHODS, "OPTIONS"]), request, SONG_PACKS_ALLOWED_METHODS);
    }

    if (url.pathname === "/api/feedback") {
      if (request.method === "OPTIONS") {
        return withCors(noContent(), request, FEEDBACK_ALLOWED_METHODS);
      }
      if (request.method === "POST") {
        return withCors(await handlePostFeedback(request, env), request, FEEDBACK_ALLOWED_METHODS);
      }

      return withCors(methodNotAllowed([...FEEDBACK_ALLOWED_METHODS, "OPTIONS"]), request, FEEDBACK_ALLOWED_METHODS);
    }

    return notFound();
  },
};
