import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, endpoints, getFieldErrors, isValidationError } from '../config/api.js';
import { useAuth } from '../app/AuthProvider.jsx';
import '../styles/create-club.css';

export default function CreateClub() {
  const navigate = useNavigate();
  const { updateSession } = useAuth();
  const [step, setStep] = useState(1);

  // Core identity
  const [name, setName] = useState('');
  const [federation, setFederation] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [emblemFile, setEmblemFile] = useState(null);
  const [emblemPreview, setEmblemPreview] = useState(null);

  // Rating parameters
  const [ratingSystem, setRatingSystem] = useState('elo');
  const [initialRating, setInitialRating] = useState(1200);
  const [kFactor, setKFactor] = useState(32);

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!emblemFile) {
      setEmblemPreview(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setEmblemPreview(e.target.result);
    reader.readAsDataURL(emblemFile);
    return () => reader.abort && reader.abort();
  }, [emblemFile]);

  function handleFileChange(e) {
    const f = e.target.files?.[0] || null;
    setEmblemFile(f);
    setErrors((s) => ({ ...s, emblem: null }));
  }

  function validateStep1() {
    const errs = {};
    if (!name.trim()) errs.name = 'Name is required.';
    if (!federation.trim()) errs.federation = 'Federation is required.';
    return errs;
  }

  function validateStep2() {
    const errs = {};
    if (!Number.isFinite(Number(initialRating))) errs.initialRating = 'Initial rating must be a number.';
    if (!Number.isFinite(Number(kFactor))) errs.kFactor = 'K-factor must be a number.';
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
      is_public: !!isPublic,
      rating: {
        system: ratingSystem,
        initial_rating: Number(initialRating) || 0,
        k_factor: Number(kFactor) || 0,
      },
    };

    // If an emblem file was selected, convert to a data URL and include as `logo`.
    async function fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    try {
      if (emblemFile) {
        try {
          payload.logo = await fileToDataUrl(emblemFile);
        } catch (err) {
          console.warn('Failed to convert emblem to data URL:', err);
        }
      }

      try {
        const data = await api.post(endpoints.clubs.create(), payload);

        // The server returns a fresh token that carries the admin role.
        // Store it so every subsequent API call and the auth context reflects
        // the promotion immediately — no logout/login required.
        if (data.token && data.user) {
          updateSession(data.token, data.user);
        }

        // Small delay so the success message is visible, then navigate home.
        setMessage('Club created! Redirecting…');
        setTimeout(() => navigate('/'), 1200);
      } catch (apiErr) {
        if (isValidationError(apiErr)) {
          setErrors(getFieldErrors(apiErr));
        } else {
          setMessage(apiErr.message || 'Failed to create club.');
        }
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

            <label style={{ marginTop: 12 }}>Emblem / Logo</label>
            <input type="file" accept="image/*" onChange={handleFileChange} />
            {emblemPreview && (
              <div className="emblem-preview" style={{ marginTop: 8 }}>
                <img src={emblemPreview} alt="emblem preview" />
              </div>
            )}
            {errors.emblem && <div className="error">{errors.emblem}</div>}

            <label style={{ marginTop: 12 }}>Visibility</label>
            <select value={isPublic ? 'public' : 'private'} onChange={(e) => setIsPublic(e.target.value === 'public')}>
              <option value="public">Public (listed)</option>
              <option value="private">Private (invite-only)</option>
            </select>

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
                <select value={ratingSystem} onChange={(e) => setRatingSystem(e.target.value)}>
                  <option value="elo">Elo</option>
                  <option value="glicko2">Glicko-2</option>
                </select>
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