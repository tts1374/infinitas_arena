import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SongSearchModalView,
  type SongSearchModalViewProps,
} from "../../components/SongSearchModalView";

const modalProps = {
  isOpen: true,
  search: "",
  selectedDiff: null,
  selectedLevel: null,
  selectedVersion: null,
  timeLeft: null,
  displayedSongs: [],
  totalSongs: 0,
  onSearchChange: () => undefined,
  onToggleDiff: () => undefined,
  onToggleLevel: () => undefined,
  onToggleVersion: () => undefined,
  onSelect: () => undefined,
} satisfies SongSearchModalViewProps;

for (const [seconds, expected, color] of [
  [null, "--:--", "text-cyan-400"],
  [0, "00:00", "text-red-500"],
  [10, "00:10", "text-red-500"],
  [30, "00:30", "text-amber-500"],
  [31, "00:31", "text-cyan-400"],
  [65, "01:05", "text-cyan-400"],
] as const) {
  test(`SongSearchModalView displays ${seconds} as ${expected} with ${color}`, () => {
    const markup = renderToStaticMarkup(
      <SongSearchModalView {...modalProps} timeLeft={seconds} />,
    );
    const countdown = markup.match(/<span class="([^"]*)">([^<]*)<\/span>/g)
      ?.find((span) => span.includes("font-mono"));

    assert.ok(countdown, "countdown is visible");
    assert.ok(countdown.includes(color), "countdown retains urgency color");
    assert.ok(countdown.endsWith(`>${expected}</span>`), "exact countdown text");
  });
}
