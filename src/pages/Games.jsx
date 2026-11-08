import { useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { PageIntro } from '../components/UI.jsx';
import { CommunityNavigation } from '../components/ModuleNavigation.jsx';
import ArcadeGame from '../games/ArcadeGame.jsx';
import MemoryGame from '../games/MemoryGame.jsx';
import ChessLobby from '../games/ChessLobby.jsx';
import ChessBoard from '../games/ChessBoard.jsx';
import { prepareOffline } from '../games/offline.js';
import NotFound from './NotFound.jsx';
import { useDemo } from '../state/DemoContext.jsx';
import BackLink from '../components/BackLink.jsx';
import GameLeaderboard from '../components/GameLeaderboard.jsx';
import { GameResultsProvider } from '../games/GameResultsContext.jsx';

function GamesContent({ kind, gameId, opponent }) {
  const { t } = useLanguage(), g = t.games;
  const { state,profile } = useDemo();
  const [offline,setOffline] = useState('');
  if (kind && !['runner','flight','memory','chess'].includes(kind)) return <NotFound />;
  if (gameId && !state.modules.games?.some((game) => game.id === gameId && [game.whiteId,game.blackId].includes(profile.id))) return <NotFound />;
  async function cache() { setOffline('busy'); try { await prepareOffline(); setOffline('ready'); } catch { setOffline('failed'); } }
  return <>
    {kind && <BackLink fallback="/community/games" />}
    <PageIntro title={kind ? g[kind] : g.title} description={kind ? undefined : g.description} />
    {!kind && <CommunityNavigation active="games" />}
    {!kind && <><div className="initiative-grid game-directory">{[['chess','♞'],['runner','↗'],['flight','✈'],['memory','✦']].map(([key,icon]) => <article className="content-card" key={key}><span className="game-directory-icon" aria-hidden="true">{icon}</span><h2>{g[key]}</h2><p>{key === 'chess' ? g.hotseat : g[key+'Hint']}</p><a className="button button-secondary" href={'#/community/games/'+key}>{g.play}</a></article>)}</div><section className="content-card offline-card"><h2>{g.offline}</h2><p>{g.offlineHint}</p>{import.meta.env.DEV && <p className="small-text">{g.offlineBuildHint}</p>}<button className="button button-secondary" type="button" disabled={offline === 'busy' || import.meta.env.DEV} onClick={cache}>{g.offline}</button><p className="save-status" role="status">{offline ? g[offline === 'busy' ? 'offlineBusy' : offline === 'ready' ? 'offlineReady' : 'offlineFailed'] : ''}</p></section></>}
    {['runner','flight'].includes(kind) && <ArcadeGame key={kind} kind={kind} />}
    {kind === 'memory' && <MemoryGame />}
    {kind === 'chess' && (gameId ? <ChessBoard id={gameId} /> : <ChessLobby initialTarget={opponent} />)}
    <GameLeaderboard game={kind || 'chess'} />
  </>;
}

export default function Games(props) {
  return <GameResultsProvider><GamesContent {...props} /></GameResultsProvider>;
}
