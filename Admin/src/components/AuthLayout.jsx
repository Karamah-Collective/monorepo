import { Brand } from "../layout/Nav.jsx";
import { Icons } from "../icons.jsx";

export default function AuthLayout({ children }) {
  return (
    <div className="pp-auth-screen">
      <section className="auth-story">
        <a href="https://maps.karamahcollective.com" className="auth-brand">
          <Brand />
        </a>
        <div className="auth-story-content">
          <span className="eyebrow">KARAMAH COLLECTIVE</span>
          <h2>
            One careful workspace
            <br />
            for the Collective.
            <br />
            <span>Maps, people, and updates together.</span>
          </h2>
          <p>
            Manage the public map, the website, and community records from one
            calm place.
          </p>
          <div className="auth-route-art" aria-hidden="true">
            <svg viewBox="0 0 420 170" fill="none">
              <path d="M0 110H80Q110 110 110 80V60Q110 30 140 30H225Q255 30 255 60V110Q255 140 285 140H420" />
              <path d="M35 170V120Q35 95 60 95H160Q185 95 185 120V170M345 0V55Q345 80 320 80H290" />
              <circle cx="110" cy="63" r="8" />
              <circle cx="255" cy="107" r="8" />
              <circle cx="345" cy="36" r="8" />
            </svg>
            <span className="auth-route-label">
              <Icons.shield />Protected team access
            </span>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>Collective administration</span>
          <span>
            Made for our community <Icons.arrowUpRight size={15} />
          </span>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-kicker">
          <Icons.shield size={18} />
          <span>COLLECTIVE ADMIN</span>
        </div>
        {children}
        <div className="auth-form-footer">
          Karamah Collective · Community administration
        </div>
      </section>
    </div>
  );
}
