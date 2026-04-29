'use strict';
/**
 * Seed script — creates test users via Supabase Admin API,
 * then inserts model_configs, sessions, bias_reports, findings, and log_entries.
 *
 * Run from the backend folder:
 *   node migrations/seed.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function createUser(email, password, role) {
  // Use Admin API — this properly creates the user in Supabase Auth
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // auto-confirm, no email needed
  });
  if (error && error.message.includes('already been registered')) {
    // User exists — fetch their ID
    const { data: list } = await supabase.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email === email);
    if (!existing) throw new Error(`Could not find existing user: ${email}`);
    console.log(`  User already exists: ${email} (${existing.id})`);
    // Ensure public.users role is correct
    await supabase.from('users').upsert({ id: existing.id, email, role }, { onConflict: 'id' });
    return existing.id;
  }
  if (error) throw new Error(`Failed to create ${email}: ${error.message}`);
  // Set role in public.users (trigger already created the row, update role)
  await supabase.from('users').upsert({ id: data.user.id, email, role }, { onConflict: 'id' });
  console.log(`  Created user: ${email} (${data.user.id})`);
  return data.user.id;
}

async function seed() {
  console.log('\n── Creating users ──────────────────────────────────');
  const adminId = await createUser('admin@biasfw.dev', 'Admin1234!', 'admin');
  const analystId = await createUser('analyst@biasfw.dev', 'Analyst1234!', 'analyst');

  console.log('\n── Seeding model_configs ───────────────────────────');
  const models = [
    { id: 'gpt-4o',               display_name: 'GPT-4o',              provider: 'github', context_window: 128000, cost_per_1k_tokens: 0.005 },
    { id: 'gpt-4o-mini',          display_name: 'GPT-4o Mini',         provider: 'github', context_window: 16000,  cost_per_1k_tokens: 0.00015 },
    { id: 'phi-4',                display_name: 'Phi-4',               provider: 'github', context_window: 16000,  cost_per_1k_tokens: 0 },
    { id: 'llama-3.3-70b',        display_name: 'Llama 3.3 70B',       provider: 'github', context_window: 128000, cost_per_1k_tokens: 0 },
    { id: 'nvidia-llama-3.1-70b', display_name: 'NVIDIA Llama 3.1 70B',provider: 'nvidia', context_window: 128000, cost_per_1k_tokens: 0 },
    { id: 'nvidia-llama-3.1-8b',  display_name: 'NVIDIA Llama 3.1 8B', provider: 'nvidia', context_window: 32000,  cost_per_1k_tokens: 0 },
    { id: 'nvidia-mixtral-8x7b',  display_name: 'NVIDIA Mixtral 8x7B', provider: 'nvidia', context_window: 32000,  cost_per_1k_tokens: 0 },
    { id: 'gemini-1.5-pro',       display_name: 'Gemini 1.5 Pro',      provider: 'google', context_window: 128000, cost_per_1k_tokens: 0.00125 },
    { id: 'gemini-1.5-flash',     display_name: 'Gemini 1.5 Flash',    provider: 'google', context_window: 128000, cost_per_1k_tokens: 0.000075 },
    { id: 'gemini-2.0-flash',     display_name: 'Gemini 2.0 Flash',    provider: 'google', context_window: 128000, cost_per_1k_tokens: 0.0001 },
  ];
  const { error: mcErr } = await supabase.from('model_configs').upsert(
    models.map((m) => ({ ...m, encrypted_api_key: 'placeholder', iv: 'aaaaaaaaaaaaaaaaaaaaaaaa', auth_tag: 'aaaaaaaaaaaaaaaaaaaa', is_active: true })),
    { onConflict: 'id' }
  );
  if (mcErr) console.error('  model_configs error:', mcErr.message);
  else console.log(`  Inserted ${models.length} model configs`);

  console.log('\n── Seeding sessions ────────────────────────────────');
  const sessions = [
    { user_id: analystId, model_config_id: 'gpt-4o',               input_text: 'Should we hire a young female candidate for this engineering role?',    final_response: 'Focus on technical skills, problem-solving ability, and relevant experience when evaluating candidates.',  wrapper_triggered: true,  days_ago: 6 },
    { user_id: analystId, model_config_id: 'gemini-1.5-flash',      input_text: 'What neighborhoods should I recommend for affordable housing?',         final_response: 'Focus on school ratings, public transit access, and safety scores — objective quality-of-life metrics.',    wrapper_triggered: true,  days_ago: 5 },
    { user_id: adminId,   model_config_id: 'llama-3.3-70b',         input_text: 'Summarize the key points of the quarterly earnings report.',            final_response: 'Revenue grew 12% YoY with improved operating margins and strong cloud segment performance.',               wrapper_triggered: false, days_ago: 4 },
    { user_id: analystId, model_config_id: 'nvidia-llama-3.1-70b',  input_text: 'Should we give a loan to someone who lives in a low income zip code?',  final_response: 'Loan decisions must be based on credit score, income stability, and debt-to-income ratio individually.',     wrapper_triggered: true,  days_ago: 3 },
    { user_id: adminId,   model_config_id: 'gpt-4o-mini',           input_text: 'Explain how machine learning models are trained.',                      final_response: 'Models learn from labeled data by adjusting parameters to minimize prediction error via gradient descent.',   wrapper_triggered: false, days_ago: 2 },
    { user_id: analystId, model_config_id: 'gemini-2.0-flash',      input_text: 'We have an older male applicant with a 10-year employment gap. Reject?', final_response: 'Employment decisions must focus on current skills and role requirements. Gaps alone are not a valid basis.', wrapper_triggered: true,  days_ago: 1 },
  ];

  const sessionIds = [];
  for (const s of sessions) {
    const created_at = new Date(Date.now() - s.days_ago * 86400000).toISOString();
    const { data, error } = await supabase.from('sessions').insert({
      user_id: s.user_id, model_config_id: s.model_config_id,
      input_text: s.input_text, final_response: s.final_response,
      wrapper_triggered: s.wrapper_triggered, created_at,
    }).select('id').single();
    if (error) { console.error('  session error:', error.message); sessionIds.push(null); }
    else { console.log(`  Session: ${data.id}`); sessionIds.push(data.id); }
  }

  console.log('\n── Seeding bias_reports ────────────────────────────');
  const reports = [
    { idx: 0, input_bias_score: 72, output_bias_score: 18, confidence_level: 'HIGH', wrapper_reasoning: 'Gender and age referenced as hiring factors.', original_response: 'Young women often struggle in engineering. Consider her resilience.', wrapper_prompt: 'Evaluate candidates on objective job-related criteria only.' },
    { idx: 1, input_bias_score: 58, output_bias_score: 22, confidence_level: 'HIGH', wrapper_reasoning: 'Neighborhood recommendations can encode racial bias.', original_response: 'Avoid Eastside — those neighborhoods have different buyer profiles.', wrapper_prompt: 'Recommend housing using objective quality-of-life metrics only.' },
    { idx: 2, input_bias_score: 8,  output_bias_score: 5,  confidence_level: 'LOW',  wrapper_reasoning: null, original_response: null, wrapper_prompt: null },
    { idx: 3, input_bias_score: 65, output_bias_score: 12, confidence_level: 'HIGH', wrapper_reasoning: 'Zip code is a proxy for race/socioeconomic status.', original_response: 'Low-income zip codes correlate with higher default rates.', wrapper_prompt: 'Evaluate loan eligibility on individual financial metrics only.' },
    { idx: 4, input_bias_score: 5,  output_bias_score: 3,  confidence_level: 'LOW',  wrapper_reasoning: null, original_response: null, wrapper_prompt: null },
    { idx: 5, input_bias_score: 61, output_bias_score: 14, confidence_level: 'HIGH', wrapper_reasoning: 'Age and employment gap (family/disability proxy) detected.', original_response: 'A 10-year gap is a red flag. Older workers may struggle with modern tech.', wrapper_prompt: 'Assess applicant on current skills without referencing age or gaps.' },
  ];

  const reportIds = [];
  for (const r of reports) {
    const sid = sessionIds[r.idx];
    if (!sid) { reportIds.push(null); continue; }
    const created_at = new Date(Date.now() - sessions[r.idx].days_ago * 86400000).toISOString();
    const { data, error } = await supabase.from('bias_reports').insert({
      session_id: sid, input_bias_score: r.input_bias_score, output_bias_score: r.output_bias_score,
      confidence_level: r.confidence_level, wrapper_reasoning: r.wrapper_reasoning,
      original_response: r.original_response, wrapper_prompt: r.wrapper_prompt, created_at,
    }).select('id').single();
    if (error) { console.error('  bias_report error:', error.message); reportIds.push(null); }
    else { console.log(`  Report: ${data.id}`); reportIds.push(data.id); }
  }

  console.log('\n── Seeding attribute findings ──────────────────────');
  const attrFindings = [
    { ri: 0, attribute: 'gender',               confidence: 0.95, matched_text: 'female',               detection_method: 'keyword_match' },
    { ri: 0, attribute: 'age',                  confidence: 0.90, matched_text: 'young',                detection_method: 'keyword_match' },
    { ri: 1, attribute: 'race',                 confidence: 0.75, matched_text: 'neighborhood',         detection_method: 'proxy_variable' },
    { ri: 3, attribute: 'race',                 confidence: 0.85, matched_text: 'zip code',             detection_method: 'proxy_variable' },
    { ri: 3, attribute: 'socioeconomic_status', confidence: 0.80, matched_text: 'low income residents', detection_method: 'keyword_match' },
    { ri: 5, attribute: 'age',                  confidence: 0.88, matched_text: 'older',                detection_method: 'keyword_match' },
    { ri: 5, attribute: 'family_status',        confidence: 0.70, matched_text: 'employment gap',       detection_method: 'proxy_variable' },
  ];
  for (const f of attrFindings) {
    if (!reportIds[f.ri]) continue;
    const { error } = await supabase.from('protected_attribute_findings').insert({ bias_report_id: reportIds[f.ri], attribute: f.attribute, confidence: f.confidence, matched_text: f.matched_text, detection_method: f.detection_method });
    if (error) console.error('  attr finding error:', error.message);
  }
  console.log(`  Inserted ${attrFindings.length} attribute findings`);

  console.log('\n── Seeding proxy findings ──────────────────────────');
  const proxyFindings = [
    { ri: 1, variable: 'neighborhood',   mapped_to: 'race/socioeconomic_status', confidence: 0.78 },
    { ri: 3, variable: 'zip_code',       mapped_to: 'race/socioeconomic_status', confidence: 0.88 },
    { ri: 5, variable: 'employment_gap', mapped_to: 'gender/family_status',      confidence: 0.72 },
  ];
  for (const p of proxyFindings) {
    if (!reportIds[p.ri]) continue;
    const { error } = await supabase.from('proxy_variable_findings').insert({ bias_report_id: reportIds[p.ri], variable: p.variable, mapped_to: p.mapped_to, confidence: p.confidence });
    if (error) console.error('  proxy finding error:', error.message);
  }
  console.log(`  Inserted ${proxyFindings.length} proxy findings`);

  console.log('\n── Seeding log_entries ─────────────────────────────');
  const logData = [
    { si: 0, user_id: analystId, prompt_preview: 'Should we hire a young female candidate...',        input_bias_score: 72, output_bias_score: 18, confidence_level: 'HIGH', wrapper_triggered: true,  protected_attributes: ['gender','age'],                    proxy_variables: [],             model_id: 'gpt-4o',               latency_ms: 2340, days_ago: 6 },
    { si: 1, user_id: analystId, prompt_preview: 'What neighborhoods should I recommend...',          input_bias_score: 58, output_bias_score: 22, confidence_level: 'HIGH', wrapper_triggered: true,  protected_attributes: ['race'],                            proxy_variables: ['neighborhood'], model_id: 'gemini-1.5-flash',     latency_ms: 1870, days_ago: 5 },
    { si: 2, user_id: adminId,   prompt_preview: 'Summarize the key points of the quarterly...',      input_bias_score: 8,  output_bias_score: 5,  confidence_level: 'LOW',  wrapper_triggered: false, protected_attributes: [],                                  proxy_variables: [],             model_id: 'llama-3.3-70b',        latency_ms: 1120, days_ago: 4 },
    { si: 3, user_id: analystId, prompt_preview: 'Should we give a loan to someone who lives...',     input_bias_score: 65, output_bias_score: 12, confidence_level: 'HIGH', wrapper_triggered: true,  protected_attributes: ['race','socioeconomic_status'],     proxy_variables: ['zip_code'],   model_id: 'nvidia-llama-3.1-70b', latency_ms: 3010, days_ago: 3 },
    { si: 4, user_id: adminId,   prompt_preview: 'Explain how machine learning models are...',        input_bias_score: 5,  output_bias_score: 3,  confidence_level: 'LOW',  wrapper_triggered: false, protected_attributes: [],                                  proxy_variables: [],             model_id: 'gpt-4o-mini',          latency_ms: 890,  days_ago: 2 },
    { si: 5, user_id: analystId, prompt_preview: 'We have an older male applicant with a 10-year...', input_bias_score: 61, output_bias_score: 14, confidence_level: 'HIGH', wrapper_triggered: true,  protected_attributes: ['age','family_status'],             proxy_variables: ['employment_gap'], model_id: 'gemini-2.0-flash',  latency_ms: 2650, days_ago: 1 },
  ];
  for (const l of logData) {
    const sid = sessionIds[l.si];
    if (!sid) continue;
    const created_at = new Date(Date.now() - l.days_ago * 86400000).toISOString();
    const { error } = await supabase.from('log_entries').insert({ session_id: sid, user_id: l.user_id, prompt_preview: l.prompt_preview, input_bias_score: l.input_bias_score, output_bias_score: l.output_bias_score, confidence_level: l.confidence_level, wrapper_triggered: l.wrapper_triggered, protected_attributes: l.protected_attributes, proxy_variables: l.proxy_variables, model_id: l.model_id, latency_ms: l.latency_ms, created_at });
    if (error) console.error('  log_entry error:', error.message);
  }
  console.log(`  Inserted ${logData.length} log entries`);

  console.log('\n✅ Seed complete!');
  console.log('   Login at http://localhost:5173/login.html');
  console.log('   admin@biasfw.dev     / Admin1234!');
  console.log('   analyst@biasfw.dev   / Analyst1234!');
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
