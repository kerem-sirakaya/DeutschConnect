import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { freshRunner, stepRunner, freshFlight, stepFlight } from './arcade.js';
import { useDemo } from '../state/DemoContext.jsx';
import { useGameResults, useResultRecorder } from './GameResultsContext.jsx';
import { arcadeResult, personalGameStats } from './leaderboards.js';

export default function ArcadeGame({ kind }) {
  const { t } = useLanguage(), g = t.games;
  const flight = kind === 'flight', fresh = flight ? freshFlight : freshRunner, step = flight ? stepFlight : stepRunner;
  const [scene,setScene] = useState(fresh), [phase,setPhase] = useState('ready');
  const {profile} = useDemo(), {data} = useGameResults();
  const {save,notice} = useResultRecorder();
  const saveRef = useRef(save); saveRef.current = save;
  const runId = useRef(null);
  const best = useMemo(() => personalGameStats({game:kind,ownerId:profile.id,results:data.results}).score,[kind,profile.id,data.results]);
  const [legacyBest] = useState(() => { try { const value=Number(localStorage.getItem('deutschconnect.best.'+kind)); return Number.isSafeInteger(value) && value>0 ? value : 0; } catch { return 0; } });
  const current = useRef(scene), input = useRef(false), field = useRef(null);
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    let frame, last;
    const draw = (time) => {
      if (last === undefined) last = time;
      const next = step(current.current,(time-last)/1000,input.current); input.current = false; last = time;
      current.current = next; setScene(next);
      if (next.over) {
        setPhase('over'); saveRef.current(arcadeResult(kind,next,runId.current,profile.id));
      } else frame = requestAnimationFrame(draw);
    };
    const pause = () => { if (document.hidden && !current.current.over) setPhase('paused'); };
    const blur = () => { if (!current.current.over) setPhase('paused'); };
    frame = requestAnimationFrame(draw); document.addEventListener('visibilitychange',pause); window.addEventListener('blur',blur);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange',pause); window.removeEventListener('blur',blur); };
  },[phase,kind]);
  function start(reset = false) { if (reset || phase === 'over' || phase === 'ready') { const next = fresh(); runId.current='run-'+crypto.randomUUID(); current.current = next; setScene(next); } input.current = false; setPhase('playing'); field.current?.focus({ preventScroll:true }); }
  function act() { if (phase === 'ready' || phase === 'over') start(true); else if (phase === 'playing') input.current = true; }
  return <section className="content-card arcade-game">
    <p>{g[kind + 'Hint']}</p>
    <div className="game-score"><span>{g.score}: <strong>{scene.score}</strong></span><span>{g.best}: {best}</span></div>
    {legacyBest > 0 && <p className="small-text">{t.leaderboard.legacy}: {legacyBest}</p>}
    <button ref={field} type="button" className="arcade-field" aria-label={g.area + ' · ' + g.jump} onPointerDown={(event) => { event.preventDefault(); act(); }} onKeyDown={(event) => { if (['Space','ArrowUp'].includes(event.code)) { event.preventDefault(); if (!event.repeat) act(); } }}>
      <svg viewBox="0 0 640 300" role="img" aria-label={g[kind]}>
        <rect width="640" height="300" fill="#0d2036" /><path d="M0 250 Q160 185 320 250 T640 250 V300 H0Z" fill="#193854" />
        <path d="M0 110 Q160 30 320 110 T640 110" fill="none" stroke="#24496e" strokeWidth="3" />
        {flight ? <>
          {scene.pipes.map((pipe,index) => <g key={index} fill="#447eae"><rect x={pipe.x} y="0" width="35" height={pipe.gap-65} rx="5" /><rect x={pipe.x} y={pipe.gap+65} width="35" height={300-pipe.gap-65} rx="5" /></g>)}
          <path d={`M72 ${scene.y-10} L108 ${scene.y} L72 ${scene.y+10} L80 ${scene.y}Z`} fill="#cce5ff" stroke="#6faafa" strokeWidth="2" />
        </> : <>
          <path d="M0 270 H640" stroke="#75a5c8" strokeWidth="3" />
          {scene.obstacles.map((o,index) => <rect key={index} x={o.x} y={270-o.height} width={o.width} height={o.height} rx="6" fill="#77a9cd" />)}
          <g transform={`translate(65 ${238-scene.y})`}><rect width="32" height="32" rx="9" fill="#5b9df7" /><path d="M8 12H12 M21 12H25 M10 24H23" stroke="#e4f1ff" strokeWidth="3" /></g>
        </>}
        {phase !== 'playing' && <g><rect x="190" y="110" width="260" height="70" rx="18" fill="#091522" fillOpacity=".9" /><text x="320" y="151" textAnchor="middle" fill="#e9f3ff" fontSize="20">{phase === 'over' ? g.over : phase === 'paused' ? g.pause : g.start}</text></g>}
      </svg>
    </button>
    <div className="form-actions"><button className="button" type="button" onClick={() => phase === 'playing' ? setPhase('paused') : start()}>{phase === 'playing' ? g.pause : phase === 'paused' ? g.resume : g.start}</button><button className="button button-secondary" type="button" onClick={() => start(true)}>{g.restart}</button></div>
    <p role="status" className="save-status">{phase === 'over' ? g.over + ' · ' + g.score + ': ' + scene.score : phase === 'paused' ? g.pause : ''}</p>{notice}<p className="small-text">{g.localHint}</p>
  </section>;
}
