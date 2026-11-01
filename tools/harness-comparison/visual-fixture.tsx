import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import RoomArena from '../../apps/client/src/components/RoomArena';
import { SongSearchModalView, type SongSearchModalSong } from '../../apps/client/src/components/SongSearchModalView';
import '../../apps/client/src/styles.css';

// Synthetic controller only: production countdown and rendering are untouched.
const songs: SongSearchModalSong[] = [{ id: 'fixture-song', title: 'Fixture Track', artist: 'Synthetic Artist', difficulty: 'ANOTHER', level: 12, version: 'INFINITAS' }];

function Fixture() {
  const query = new URLSearchParams(window.location.search);
  const raw = query.get('time') ?? 'null';
  const time = raw === 'null' ? null : Number(raw);
  const isHost = query.get('role') !== 'guest';
  const [open, setOpen] = useState(query.get('open') !== 'false');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('none');
  const [diff, setDiff] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const modal = <SongSearchModalView isOpen={open} timeLeft={time}
    search={search} selectedDiff={diff} selectedLevel={level} selectedVersion={version}
    displayedSongs={songs.filter(s => s.title.toLowerCase().includes(search.toLowerCase()))} totalSongs={songs.length}
    onSearchChange={setSearch} onToggleDiff={setDiff} onToggleLevel={setLevel} onToggleVersion={setVersion}
    onSelect={song => { setSelected(String(song.id)); setOpen(false); }} />;
  return <>
    <div data-testid="fixture-controls" style={{ position: 'fixed', zIndex: 500, bottom: 0, left: 0, background: '#fff', color: '#000', fontSize: 11 }}>
      <button data-testid="fixture-open" onClick={() => setOpen(true)}>Fixture open</button>{' '}
      <button data-testid="fixture-close" onClick={() => setOpen(false)}>Fixture close</button>{' '}
      <output data-testid="fixture-selected">{selected}</output>{' '}
      <span data-testid="fixture-role">{isHost ? 'host' : 'guest'}</span>
    </div>
    <RoomArena isReady={false} roomStatus="SELECTING" closeReason="" resultTimer={0} roundCount={1}
      history={[]} playerPicks={{}} showSearch={open} showCutIn={false} lastPickedSong={null}
      copiedId={false} copiedCode={false} lobbyTimer={0} currentPlayers={2} maxPlayers={4}
      roomId="comparison-room" joinCode="" pickingCountdownSeconds={time} playTime={0}
      playingPhase="MUSIC_SELECT" playingCountdownSeconds={45}
      playerStatus={{ '1': 'UNCONFIRMED', '2': 'UNCONFIRMED' }} isHost={isHost}
      allPlayers={[{ id: '1', name: 'HOST', isReady: true, isHost: true }, { id: '2', name: 'GUEST', isReady: true, isHost: false }]}
      selfPlayerId={isHost ? '1' : '2'} onOpenSearch={() => setOpen(true)} searchModal={modal} />
  </>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
