const admin = require('../config/firebase');
const supabase = require('../config/supabase');

// ─── Plan limits ────────────────────────────────────────────────────
const PLAN_LIMITS = {
  free: {
    summaries_per_day: 3,
    chat_messages_per_summary: 0,
    sizes_allowed: ['small'],
    pdf_upload: false,
    export: false,
    audio: false,
    social_images: 0,
    slides: false,
    max_file_mb: 0,
  },
  basic: {
    summaries_per_day: 50,
    chat_messages_per_summary: 10,
    sizes_allowed: ['small', 'medium', 'large'],
    pdf_upload: true,
    export: true,
    audio: true,
    social_images: 3,
    slides: false,
    max_file_mb: 10,
  },
  premium: {
    summaries_per_day: Infinity,
    chat_messages_per_summary: Infinity,
    sizes_allowed: ['small', 'medium', 'large'],
    pdf_upload: true,
    export: true,
    audio: true,
    social_images: 5,
    slides: true,
    max_file_mb: 50,
  },
};

// ─── Verify Firebase token ──────────────────────────────────────────
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email;

    // Load or create user in Supabase
    let { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('firebase_uid', decoded.uid)
      .single();

    if (error && error.code === 'PGRST116') {
      // User doesn't exist yet — auto-create on first login
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({
          firebase_uid: decoded.uid,
          email: decoded.email,
          display_name: decoded.name || decoded.email?.split('@')[0] || 'User',
          plan: 'free',
        })
        .select()
        .single();

      if (insertError) {
        console.error('[auth] Failed to create user record:', insertError);
        return res.status(500).json({ error: 'Failed to create user record', detail: insertError.message });
      }
      user = newUser;
    } else if (error) {
      console.error('[auth] Supabase user lookup error:', error);
      return res.status(500).json({ error: 'Database error', detail: error.message, code: error.code });
    }

    req.user = user;
    req.planLimits = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── Check a specific feature is available on the user's plan ──────
function requireFeature(feature) {
  return (req, res, next) => {
    const limits = req.planLimits;
    if (!limits[feature]) {
      return res.status(403).json({
        error: `This feature requires a higher plan.`,
        required_plan: feature === 'slides' ? 'premium' : 'basic',
        current_plan: req.user.plan,
      });
    }
    next();
  };
}

// ─── Check daily quota for summaries ───────────────────────────────
async function checkSummaryQuota(req, res, next) {
  if (req.planLimits.summaries_per_day === Infinity) return next();

  const today = new Date().toISOString().split('T')[0];
  const { count } = await supabase
    .from('summaries')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .gte('created_at', `${today}T00:00:00Z`);

  if (count >= req.planLimits.summaries_per_day) {
    return res.status(429).json({
      error: `Daily limit of ${req.planLimits.summaries_per_day} summaries reached.`,
      reset_at: `${today}T23:59:59Z`,
      current_plan: req.user.plan,
    });
  }
  next();
}

module.exports = { authenticate, requireFeature, checkSummaryQuota, PLAN_LIMITS };
