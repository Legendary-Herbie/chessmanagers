import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFieldErrors, isValidationError } from '../config/api.js';
import { useAuth, useClub } from '../app/contextHooks.js';
import { clubApi } from '../features/clubs/api/clubApi.js';
import '../styles/create-club.css';

export default function CreateClub() {
  const navigate = useNavigate();
  const { updateSession } = useAuth();
  const { refreshClubs } = useClub();
  const [step, setStep] = useState(1);

  // Core identity
  const [name, setName] = useState('');
  const [federation, setFederation] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [badgeFile, setBadgeFile] = useState(null);

  // Rating parameters
  const [initialRating, setInitialRating] = useState(1500);
  const [ratingFloor, setRatingFloor] = useState(500);
  const [kFactor, setKFactor] = useState(32);
  const [provisionalKFactor, setProvisionalKFactor] = useState(40);
  const [provisionalGames, setProvisionalGames] = useState(10);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);

  function validateStep1() {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required.';
    if (!federation.trim()) errs.federation = 'Federation is required.';
    return errs;
  }

  function validateStep2() {
    const errs = {};
    if (!Number.isFinite(Number(initialRating))) errs.initialRating = 'Initial rating must be a number.';
    if (!Number.isFinite(Number(ratingFloor)) || Number(ratingFloor) > Number(initialRating)) errs.ratingFloor = 'Rating floor must not exceed the initial rating.';
    if (!Number.isFinite(Number(kFactor))) errs.kFactor = 'K-factor must be a number.';
    if (!Number.isFinite(Number(provisionalKFactor))) errs.provisionalKFactor = 'Provisional K-factor must be a number.';
    if (!Number.isFinite(Number(provisionalGames))) errs.provisionalGames = 'Provisional games must be a number.';
    return errs;
  }

  async function handleNext() {
    setErrors({});
    if (step === 1) {
      const e = validateStep1();
      if (Object.keys(e).length) return setErrors(e);
      setStep(2);
    } else {
      const e = validateStep2();
      if (Object.keys(e).length) return setErrors(e);
    }
  }

  function handleBack() {
    setErrors({});
    setMessage(null);
    setStep((s) => Math.max(1, s - 1));
  }

  async function handleSubmit(e) {
    e && e.preventDefault && e.preventDefault();
    setLoading(true);
    setErrors({});
    setMessage(null);
    const payload = {
      name: name.trim(),
      federation: federation.trim(),
      visibility: isPublic ? 'public' : 'private',
      publicLeaderboard: true,
      ratingSettings: Object.fromEntries(['blitz', 'rapid', 'classical'].map(category => [category, {
        initialRating: Number(initialRating),
        ratingFloor: Number(ratingFloor),
        establishedKFactor: Number(kFactor),
        provisionalKFactor: Number(provisionalKFactor),
        provisionalGames: Number(provisionalGames),
      }])),
    };

    try {
      const data = await clubApi.create(payload);

      // Refresh the account session returned alongside the new club. Club
      // permissions remain scoped to the membership loaded by ClubProvider.
      if (data.token && data.user) {
        updateSession(data.token, data.user);
      }

      if (badgeFile) {
        await clubApi.uploadBadge(data.club.id, badgeFile);
      }

      await refreshClubs(data.club.id);

      setMessage('Club created! Redirecting…');
      setTimeout(() => navigate('/dashboard'), 1200);
    } catch (apiErr) {
      if (isValidationError(apiErr)) {
        setErrors(getFieldErrors(apiErr));
      } else {
        setMessage(apiErr.message || 'Failed to create club.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="create-club">
      <h1>Create Club</h1>

      <div className="stepper">
        <div className="stepper-label">Step {step} of 2</div>
        <div className="progress"><div className="progress-bar" style={{ width: step === 1 ? '50%' : '100%' }} /></div>
      </div>

      <form onSubmit={handleSubmit}>
        {step === 1 && (
          <section>
            <h2 style={{ marginTop: 0 }}>Core Identity</h2>

            <label>Name</label>
            <input className="" placeholder="e.g. Royal Gambit Chess Academy" value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <div className="error">{errors.name}</div>}

            <label style={{ marginTop: 12 }}>Federation</label>
            <input placeholder="e.g. USCF" value={federation} onChange={(e) => setFederation(e.target.value)} />
            {errors.federation && <div className="error">{errors.federation}</div>}

            <label style={{ marginTop: 12 }}>Club badge</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setBadgeFile(e.target.files?.[0] || null)} />
            <div className="form-helper" style={{ marginTop: 4, fontSize: 13, color: '#6b7280' }}>
              {badgeFile ? `${badgeFile.name} selected` : 'JPEG, PNG, or WebP; maximum 5 MB.'}
            </div>

            <label style={{ marginTop: 12 }}>Visibility</label>
            <select value={isPublic ? 'public' : 'private'} onChange={(e) => setIsPublic(e.target.value === 'public')}>
              <option value="public">Public (listed)</option>
              <option value="private">Private (invite-only)</option>
            </select>
            <div className="form-helper" style={{ marginTop: 4, fontSize: 13, color: '#6b7280' }}>
              {isPublic
                ? 'Anyone can find this club on the Find Clubs page and request to join.'
                : "This club won't appear on the Find Clubs page. People can still join via an invite link, or by requesting to join if they have the club's direct URL."}
            </div>

            <div className="controls">
              <button type="button" className="btn btn-secondary" onClick={handleNext}>Proceed to Rating</button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 style={{ marginTop: 0 }}>Rating Parameters</h2>

            <div className="form-row">
              <div>
                <label>Rating system</label>
                <input value="Elo" disabled />
              </div>

              <div>
                <label>Initial rating</label>
                <input type="number" value={initialRating} onChange={(e) => setInitialRating(e.target.value)} />
                {errors.initialRating && <div className="error">{errors.initialRating}</div>}
              </div>
            </div>

            <label style={{ marginTop: 12 }}>K-factor</label>
            <input type="number" value={kFactor} onChange={(e) => setKFactor(e.target.value)} />
            {errors.kFactor && <div className="error">{errors.kFactor}</div>}

            <label style={{ marginTop: 12 }}>Rating floor</label>
            <input type="number" value={ratingFloor} onChange={(e) => setRatingFloor(e.target.value)} />
            {errors.ratingFloor && <div className="error">{errors.ratingFloor}</div>}

            <label style={{ marginTop: 12 }}>Provisional K-factor</label>
            <input type="number" value={provisionalKFactor} onChange={(e) => setProvisionalKFactor(e.target.value)} />
            {errors.provisionalKFactor && <div className="error">{errors.provisionalKFactor}</div>}

            <label style={{ marginTop: 12 }}>Provisional games</label>
            <input type="number" value={provisionalGames} onChange={(e) => setProvisionalGames(e.target.value)} />
            {errors.provisionalGames && <div className="error">{errors.provisionalGames}</div>}

            <div className="controls">
              <button type="button" className="btn btn-secondary" onClick={handleBack}>Back</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Creating…' : 'Create Club'}</button>
            </div>
          </section>
        )}
      </form>

      {message && <div className="message">{message}</div>}
    </div>
  );
}
