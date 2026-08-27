import { Link } from 'react-router-dom';
import PageBackground from '../components/PageBackground.jsx';

export default function ContactPage() {
  return (
    <div className="auth-page">
      <PageBackground image="/backgrounds/contact-1.jpg" />
      <div className="auth-form">
        <h1>Contact us</h1>
        <p className="auth-subtitle">Questions, feedback, or something not working right — reach out.</p>
        <p>
          Email: <a href="mailto:support@streetleague.app">support@streetleague.app</a>
        </p>
        <p className="auth-switch">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
