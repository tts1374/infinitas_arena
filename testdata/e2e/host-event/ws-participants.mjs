// Real WS peers share the two Tauri clients' local DO. No Ready or UI actions.
import { writeFile } from "node:fs/promises";
const [api, roomId, countText, output] = process.argv.slice(2);
const count = Number(countText);
if (!api || !roomId || !output || !Number.isInteger(count) || count < 1 || count > 20) throw new Error("Expected api roomId count output");
const peers = [];
const started = new Date().toISOString();
const unlocks = { bit_unlocked: true, djp_unlocked: true, allow_leggendaria: true, owned_pack_ids: [] };
let saveQueue = Promise.resolve();
function save() {
  const data = JSON.stringify({ started, updated: new Date().toISOString(), roomId, count, runtime: "actual WebSocket peers in the Tauri room", peers: peers.map(({ id, joined, submissions, acks, errors, rounds, final }) => ({ id, joined, submissions, acks, errors, rounds, final })) }, null, 2);
  saveQueue = saveQueue.then(() => writeFile(output, data));
}
for (let index = 0; index < count; index++) {
  const peer = { id: `r6-ws-${index + 1}`, joined: false, submissions: [], acks: [], errors: [], rounds: [], final: false };
  const ws = new WebSocket(api.replace(/^http/, "ws") + `/api/rooms/${roomId}/ws`);
  peer.ws = ws;
  peers.push(peer);
  const send = (type, payload) => ws.send(JSON.stringify({ type, room_id: roomId, player_id: peer.id, client_msg_id: payload.request_id ?? crypto.randomUUID(), payload }));
  ws.addEventListener("open", () => send("EVENT_JOIN", { host_event_protocol: 2, client_version: "1.4.0", join_code: "R6TEST88", display_name: `WS PLAYER ${String(index + 1).padStart(2, "0")}`, source: "reflux", song_unlocks: unlocks }));
  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "EVENT_ERROR") peer.errors.push(message.payload);
    if (message.type === "EVENT_ACTION_ACK") peer.acks.push(message.payload.request_id);
    if (message.type === "EVENT_JOIN_ACCEPTED") peer.joined = true;
    const snapshot = message.payload.event_room_snapshot;
    if (snapshot) {
      if (snapshot.phase === "PLAYING" && snapshot.round_phase === "ACTIVE" && !peer.submissions.some((item) => item.round_id === snapshot.current_round_id)) {
        const request_id = crypto.randomUUID();
        const action = { action: "SUBMIT", request_id, generation: snapshot.generation, event_id: snapshot.event_id, round_id: snapshot.current_round_id, observed_key: snapshot.selected_chart.expected_key, metric_value: 1900 + index };
        peer.submissions.push({ round_id: action.round_id, expected_key: action.observed_key, request_id, timestamp: new Date().toISOString() });
        send("EVENT_ACTION", action);
      }
      if (snapshot.latest_result && !peer.rounds.includes(snapshot.latest_result.round_id)) peer.rounds.push(snapshot.latest_result.round_id);
      peer.final = snapshot.phase === "RESULT";
    }
    save();
  });
  ws.addEventListener("error", () => { peer.errors.push({ code: "TRANSPORT_ERROR" }); save(); });
}
const ping = setInterval(() => { for (const { ws, id } of peers) if (ws.readyState === 1) ws.send(JSON.stringify({ type: "PING", client_msg_id: crypto.randomUUID(), room_id: roomId, player_id: id, payload: {} })); }, 20_000);
save();
async function stop() { clearInterval(ping); for (const { ws } of peers) ws.close(); await saveQueue; process.exit(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
