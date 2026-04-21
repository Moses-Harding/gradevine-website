import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase/config';
import { ref, get, set, child } from 'firebase/database';

const ADMIN_USER_ID = '_cc831b2c736681ff02525cdf665cfafd';

// ---------- Types ----------

interface PromoCode {
  code: string;
  creditAmount: number;
  maxRedemptions: number;
  currentRedemptions: number;
  expirationDate: string;
  isActive: boolean;
  description: string;
}

// ---------- Auth Gate ----------

function AdminAuthGate() {
  const slotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const button = document.getElementById('apple-sign-in-button');
    const slot = slotRef.current;
    if (!button || !slot) return;

    const originalParent = button.parentElement;
    slot.appendChild(button);

    return () => {
      if (originalParent) originalParent.appendChild(button);
    };
  }, []);

  return (
    <div className="admin-login-container">
      <div className="admin-login-card">
        <h1 className="admin-login-title">Admin Console</h1>
        <p className="admin-login-subtitle">Sign in with your Apple ID to continue</p>
        <div className="admin-apple-slot-wrap">
          <div ref={slotRef} className="admin-apple-slot" />
        </div>
      </div>
    </div>
  );
}

function AdminAccessDenied() {
  return (
    <div className="admin-login-container">
      <div className="admin-login-card">
        <h1 className="admin-login-title">Access Denied</h1>
        <p className="admin-login-subtitle">Your account is not authorized for admin access.</p>
        <a href="/" className="admin-login-button" style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}>
          Back to Home
        </a>
      </div>
    </div>
  );
}

// ---------- Promo Code Section ----------

function PromoCodeSection() {
  const [codeName, setCodeName] = useState('');
  const [creditAmount, setCreditAmount] = useState('100');
  const [maxRedemptions, setMaxRedemptions] = useState('10');
  const [expiryDays, setExpiryDays] = useState('30');
  const [creating, setCreating] = useState(false);
  const [createStatus, setCreateStatus] = useState('');

  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loadingCodes, setLoadingCodes] = useState(true);

  const promoRef = ref(db, 'promo_codes');

  const loadCodes = async () => {
    setLoadingCodes(true);
    try {
      const snapshot = await get(promoRef);
      if (snapshot.exists()) {
        const data = snapshot.val() as Record<string, Omit<PromoCode, 'code'>>;
        const list = Object.entries(data).map(([code, vals]) => ({
          code,
          ...vals,
        }));
        list.sort((a, b) => {
          if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
          return b.expirationDate.localeCompare(a.expirationDate);
        });
        setCodes(list);
      } else {
        setCodes([]);
      }
    } catch (err) {
      console.error('Failed to load promo codes:', err);
    }
    setLoadingCodes(false);
  };

  useEffect(() => { loadCodes(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedCode = codeName.trim().toUpperCase();
    if (!normalizedCode) return;

    setCreating(true);
    setCreateStatus('');

    const expDate = new Date();
    expDate.setDate(expDate.getDate() + (parseInt(expiryDays) || 30));

    const codeData = {
      creditAmount: parseInt(creditAmount) || 100,
      maxRedemptions: parseInt(maxRedemptions) || 10,
      currentRedemptions: 0,
      expirationDate: expDate.toISOString(),
      isActive: true,
      description: 'Admin-created code',
    };

    try {
      await set(child(promoRef, normalizedCode), codeData);
      setCreateStatus(`Created "${normalizedCode}" successfully`);
      setCodeName('');
      await loadCodes();
    } catch (err) {
      setCreateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setCreating(false);
  };

  const isExpired = (iso: string) => new Date(iso) < new Date();

  return (
    <div className="admin-section">
      <h3 className="admin-section-title">Promo Codes</h3>

      <form className="admin-promo-form" onSubmit={handleCreate}>
        <p className="admin-label">Create Code</p>
        <div className="admin-row">
          <div className="admin-field">
            <label className="admin-field-label">Code Name</label>
            <input
              className="admin-input admin-input-mono"
              placeholder="e.g. WELCOME50"
              value={codeName}
              onChange={(e) => setCodeName(e.target.value.toUpperCase())}
            />
          </div>
          <div className="admin-field admin-field-narrow">
            <label className="admin-field-label">Credits</label>
            <input
              className="admin-input"
              placeholder="100"
              type="number"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
          </div>
        </div>
        <div className="admin-row">
          <div className="admin-field">
            <label className="admin-field-label">Max Uses</label>
            <input
              className="admin-input"
              placeholder="10"
              type="number"
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
            />
          </div>
          <div className="admin-field">
            <label className="admin-field-label">Expiry Days</label>
            <input
              className="admin-input"
              placeholder="30"
              type="number"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
            />
          </div>
        </div>
        <button
          type="submit"
          className="admin-button admin-button-blue"
          disabled={creating || !codeName.trim()}
        >
          {creating ? 'Creating...' : 'Create in Firebase'}
        </button>
      </form>

      {createStatus && (
        <p className={`admin-status ${createStatus.startsWith('Error') ? 'admin-status-error' : 'admin-status-success'}`}>
          {createStatus}
        </p>
      )}

      <p className="admin-label" style={{ marginTop: 20 }}>
        Existing Codes
        <button className="admin-refresh-btn" onClick={loadCodes} disabled={loadingCodes}>
          {loadingCodes ? '...' : 'Refresh'}
        </button>
      </p>

      {loadingCodes ? (
        <p className="admin-muted">Loading...</p>
      ) : codes.length === 0 ? (
        <p className="admin-muted">No promo codes found.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Credits</th>
                <th>Used</th>
                <th>Max</th>
                <th>Expires</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => {
                const expired = isExpired(c.expirationDate);
                const exhausted = c.currentRedemptions >= c.maxRedemptions;
                const status = !c.isActive ? 'Inactive' : expired ? 'Expired' : exhausted ? 'Exhausted' : 'Active';
                const statusClass = status === 'Active' ? 'admin-tag-green' : 'admin-tag-gray';

                return (
                  <tr key={c.code}>
                    <td className="admin-mono">{c.code}</td>
                    <td>{c.creditAmount}</td>
                    <td>{c.currentRedemptions}</td>
                    <td>{c.maxRedemptions}</td>
                    <td>{new Date(c.expirationDate).toLocaleDateString()}</td>
                    <td><span className={`admin-tag ${statusClass}`}>{status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------- Analytics Section ----------

function AnalyticsSection() {
  const metrics = [
    { label: 'Batch Scans', value: '\u2014' },
    { label: 'Pages Processed', value: '\u2014' },
    { label: 'Success Rate', value: '\u2014' },
    { label: 'Error Rate', value: '\u2014' },
  ];

  const qualityMetrics = [
    { label: 'Hallucination Rate', value: '\u2014' },
    { label: 'Manual Corrections', value: '\u2014' },
    { label: 'Low Confidence', value: '\u2014' },
    { label: 'Name Match Rate', value: '\u2014' },
  ];

  return (
    <div className="admin-section">
      <h3 className="admin-section-title">Analytics Dashboard</h3>
      <p className="admin-muted" style={{ marginBottom: 16 }}>
        Analytics events are stored locally on each device. Connect a centralized pipeline (e.g. Firebase Analytics) to populate this dashboard.
      </p>

      <p className="admin-label">Key Metrics</p>
      <div className="admin-metrics-grid">
        {metrics.map((m) => (
          <div key={m.label} className="admin-metric-card">
            <span className="admin-metric-value">{m.value}</span>
            <span className="admin-metric-label">{m.label}</span>
          </div>
        ))}
      </div>

      <p className="admin-label" style={{ marginTop: 20 }}>Quality Metrics</p>
      <div className="admin-metrics-grid">
        {qualityMetrics.map((m) => (
          <div key={m.label} className="admin-metric-card">
            <span className="admin-metric-value">{m.value}</span>
            <span className="admin-metric-label">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Dashboard ----------

function AdminDashboard({ displayName }: { displayName: string | null }) {
  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-header-left">
            <a href="/" className="admin-logo">GradeVine</a>
            <span className="admin-badge">Admin</span>
          </div>
          <div className="admin-header-right">
            {displayName && <span className="admin-user-name">{displayName}</span>}
          </div>
        </div>
      </header>

      <main className="admin-main">
        <h2 className="admin-page-title">Dashboard</h2>
        <div className="admin-sections">
          <PromoCodeSection />
          <AnalyticsSection />
        </div>
      </main>
    </div>
  );
}

// ---------- Root ----------

export function AdminApp() {
  const { auth, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="admin-login-container">
        <p className="admin-muted">Loading...</p>
      </div>
    );
  }

  if (!auth.isSignedIn) {
    return <AdminAuthGate />;
  }

  if (auth.userRecordName !== ADMIN_USER_ID) {
    return <AdminAccessDenied />;
  }

  return <AdminDashboard displayName={auth.displayName} />;
}
