import Disclosure from '../shared/common/Disclosure.jsx';
import Icon from '../shared/common/Icon.jsx';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFieldErrors, isValidationError } from '../config/api.js';
import { useAuth, useClub } from '../app/contextHooks.js';
import { clubApi } from '../features/clubs/api/clubApi.js';
import { FEDERATION_CODES } from '../features/clubs/federations.js';
import '../styles/create-club.css';

export default function CreateClub() {
  const navigate = useNavigate();
  const { updateSession } = useAuth();
  const { refreshClubs } = useClub();
  const [created, setCreated] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
  const [messageIsError, setMessageIsError] = useState(false);
  const [message, setMessage] = useState(null);
  const [badgePreview, setBadgePreview] = useState('');

  useEffect(() => {
    if (!badgeFile) {
      setBadgePreview('');
      return undefined;
    }
    if (typeof URL.createObjectURL !== 'function') return undefined;
    const preview = URL.createObjectURL(badgeFile);
    setBadgePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [badgeFile]);

  function validateStep1() {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required.';
    else if (name.trim().length > 150) errs.name = 'Use no more than 150 characters.';
    if (!federation.trim()) errs.federation = 'Federation is required.';
    else if (federation.trim().length > 5) errs.federation = 'Use a federation code of no more than 5 characters.';
    return errs;
  }

  function validateStep2() {
    const errs = {};
    for (const [field, value, min, max] of [
      ['initialRating', initialRating, 100, 4000], ['ratingFloor', ratingFloor, 0, 4000],
      ['kFactor', kFactor, 1, 100], ['provisionalKFactor', provisionalKFactor, 1, 100],
      ['provisionalGames', provisionalGames, 1, 100],
    ]) {
      if (String(value).trim() === '' || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max)
        errs[field] = `Enter a whole number from ${min} to ${max}.`;
    }
    if (Number(ratingFloor) > Number(initialRating)) errs.ratingFloor = 'Rating floor must not exceed the initial rating.';
    return errs;
  }

  async function handleSubmit(e) {
    e && e.preventDefault && e.preventDefault();
    if (loading || created) return;
    const validation = { ...validateStep1(), ...validateStep2() };
    if (Object.keys(validation).length) {
      setErrors(validation);
      if (Object.keys(validateStep2()).length) setAdvancedOpen(true);
      return;
    }
    setLoading(true);
    setErrors({});
    setMessage(null);
    setMessageIsError(false);
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

    let createdClub = null;
    try {
      const data = await clubApi.create(payload);
      createdClub = data.club;
      setCreated(true);

      // Refresh the account session returned alongside the new club. Club
      // permissions remain scoped to the membership loaded by ClubProvider.
      if (data.token && data.user) {
        updateSession(data.token, data.user);
      }

      let badgeUploadFailed = false;
      if (badgeFile) {
        try {
          await clubApi.uploadBadge(data.club.id, badgeFile);
        } catch {
          badgeUploadFailed = true;
        }
      }

      await refreshClubs(data.club.id);

      setMessage(badgeUploadFailed
        ? 'Club created, but the badge could not be uploaded. You can add it later. Redirecting…'
        : 'Club created! Redirecting…');
      setTimeout(() => navigate('/dashboard'), 1200);
    } catch (apiErr) {
      setMessageIsError(true);
      if (createdClub) {
        setMessage('Club created, but the dashboard could not be refreshed. Reload the page to continue.');
      } else if (isValidationError(apiErr)) {
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

      <p className="muted">Set up your club with independent Blitz, Rapid, and Classical ratings. You can adjust the details later.</p>
      <form onSubmit={handleSubmit} noValidate>
        <fieldset className="form-fieldset" disabled={loading || created}>
          <section>
            <label htmlFor="create-name">Name</label>
            <input id="create-name" className="" placeholder="e.g. Royal Gambit Chess Academy" value={name} onChange={(e) => setName(e.target.value)} />
            {errors.name && <div className="error" role="alert">{errors.name}</div>}

            <div className="create-club__identity-grid">
              <div>
                <label htmlFor="create-federation">Federation</label>
                <select id="create-federation" value={federation} onChange={(e) => setFederation(e.target.value)}>
                  <option value="">Select federation</option>
                  {FEDERATION_CODES.map(code => <option value={code} key={code}>{code}</option>)}
                </select>
                {errors.federation && <div className="error" role="alert">{errors.federation}</div>}
              </div>
              <div>
                <label htmlFor="create-visibility">Visibility</label>
                <select id="create-visibility" value={isPublic ? 'public' : 'private'} onChange={(e) => setIsPublic(e.target.value === 'public')}>
                  <option value="public">Public (listed)</option>
                  <option value="private">Private (invite-only)</option>
                </select>
                <div className="form-helper">{isPublic
                  ? 'Listed publicly so people can discover and request to join.'
                  : 'Hidden from discovery; people join with an invite or code.'}</div>
              </div>
            </div>

            <label htmlFor="create-badge" className="create-club__badge-label">Club badge</label>
            <div className="create-club__badge-field">
              {badgePreview ? <img src={badgePreview} alt="Club badge preview" />
                : <span className="create-club__badge-placeholder" aria-hidden="true"><Icon name="club" size="xl" /></span>}
              <div><input id="create-badge" type="file" accept="image/jpeg,image/png,image/webp"
                onChange={e => setBadgeFile(e.target.files?.[0] || null)} />
                <div className="form-helper">{badgeFile ? `${badgeFile.name} selected` : 'JPEG, PNG, or WebP; maximum 5 MB.'}</div></div>
            </div>
          </section>
          <Disclosure title="Advanced rating rules (optional)" forceOpen={advancedOpen}>
            <p className="muted">Starting rating 1500 · floor 500 · established K 32 · provisional K 40 for 10 games. Applied separately to each category.</p>
            <div className="rating-parameter-grid">
              <div className="rating-parameter-grid__system">
                <label htmlFor="create-system">Rating system</label>
                <input id="create-system" value="Elo" readOnly aria-describedby="rating-system-help" />
                <div id="rating-system-help" className="form-helper">1chessclub uses Elo for Blitz, Rapid, and Classical ratings.</div>
              </div>

              <div>
                <label htmlFor="create-initialRating">Initial rating</label>
                <input id="create-initialRating" type="number" value={initialRating} onChange={(e) => setInitialRating(e.target.value)} />
                {errors.initialRating && <div className="error" role="alert">{errors.initialRating}</div>}
              </div>
              <div><label htmlFor="create-ratingFloor">Rating floor</label>
                <input id="create-ratingFloor" type="number" value={ratingFloor} onChange={(e) => setRatingFloor(e.target.value)} />
                {errors.ratingFloor && <div className="error" role="alert">{errors.ratingFloor}</div>}</div>
              <div><label htmlFor="create-kFactor">K-factor</label>
                <input id="create-kFactor" type="number" value={kFactor} onChange={(e) => setKFactor(e.target.value)} />
                {errors.kFactor && <div className="error" role="alert">{errors.kFactor}</div>}</div>
              <div><label htmlFor="create-provisionalKFactor">Provisional K-factor</label>
                <input id="create-provisionalKFactor" type="number" value={provisionalKFactor} onChange={(e) => setProvisionalKFactor(e.target.value)} />
                {errors.provisionalKFactor && <div className="error" role="alert">{errors.provisionalKFactor}</div>}</div>
              <div><label htmlFor="create-provisionalGames">Provisional games</label>
                <input id="create-provisionalGames" type="number" value={provisionalGames} onChange={(e) => setProvisionalGames(e.target.value)} />
                {errors.provisionalGames && <div className="error" role="alert">{errors.provisionalGames}</div>}</div>
            </div>

          </Disclosure>
            <div className="controls">
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Creating…' : 'Create Club'}</button>
            </div>
        </fieldset>
      </form>

      {message && <div className="message" role={messageIsError ? 'alert' : 'status'}>{message}</div>}
    </div>
  );
}
