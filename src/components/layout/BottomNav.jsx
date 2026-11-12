import MainNav from './MainNav.jsx';

/** Schwebende untere Navigation für Smartphone und Tablet (auf dem Desktop ausgeblendet). */
export default function BottomNav() {
  return (
    <div className="bottom-nav">
      <MainNav variant="bottom" />
    </div>
  );
}
