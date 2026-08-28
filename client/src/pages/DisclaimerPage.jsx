import { Link } from 'react-router-dom';
import PageBackground from '../components/PageBackground.jsx';

export default function DisclaimerPage() {
  return (
    <div className="auth-page">
      <PageBackground image="/backgrounds/contact-1.jpg" dim="light" />
      <div className="auth-form disclaimer-form">
        <h1>Terms & Liability Disclaimer</h1>

        <h3>Assumption of risk</h3>
        <p>
          Street League is a social and organizational tool for car enthusiasts. Driving, racing, and attending
          meet-ups or cruises are inherently dangerous activities. By creating an account, you acknowledge that
          any challenge, roll race, cruise, or other activity you organize or join through this app is entirely
          voluntary and at your own risk. You are solely responsible for your own safety and the safety of others
          around you.
        </p>

        <h3>No encouragement of illegal activity</h3>
        <p>
          Street League does not sanction, endorse, sponsor, or encourage street racing, reckless driving, or any
          activity that violates local, state, or federal law. Any "challenge" or "roll race" created through this
          app is a self-timed activity between consenting users — you are responsible for obeying all traffic laws,
          speed limits, and regulations at all times, on public roads or otherwise.
        </p>

        <h3>No liability</h3>
        <p>
          To the fullest extent permitted by law, Street League, its creator(s), and operators are not liable for
          any injury, death, property damage, traffic citation, criminal charge, or other loss or harm arising from
          your use of this app or your participation in any activity organized, discovered, or coordinated through
          it — including activity by other users.
        </p>

        <h3>Location & GPS accuracy</h3>
        <p>
          Map positions, speed readings, and timing (including SOS alerts) rely on your device's GPS and network
          connection, which can be delayed, inaccurate, or unavailable. Do not rely on this app for emergency
          services — always contact local emergency services directly if you or someone else needs help.
        </p>

        <h3>User conduct</h3>
        <p>
          You must be legally permitted to drive in your jurisdiction to participate in any driving-related
          feature. You are responsible for your own conduct and content (chat messages, reports, challenge names,
          etc.) and agree not to use the app to coordinate illegal activity or endanger others.
        </p>

        <h3>Beta software</h3>
        <p>
          This app is in active beta. Features may change or break without notice, and no warranty — express or
          implied — is made about its reliability, availability, or fitness for any particular purpose.
        </p>

        <p className="auth-switch">
          <Link to="/contact">Contact us</Link> · <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
