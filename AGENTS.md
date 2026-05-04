# iPrpr Project Instructions

This repo is the source of truth.

Do not assume earlier ChatGPT or Lovable prompts are correct.
The user has made direct changes in Lovable that may override earlier instructions.

## Product Rules

App name:
iPrpr

Global brand block:
iPrpr  
Aim. Prepare. Land.  
Train your interview performance.

Hero/supporting copy:
Your profile. Your target. Fifty questions built for both. Feedback on how you actually perform.

Question limits:
- Free: 10 visible questions once per month
- Pro / Coach+: maximum 50 questions
- Backend must never generate more than 50 questions
- No 100-question generation logic should remain

Generation:
- First 10 questions should appear quickly
- Status flow: draft → generating → initial_ready → ready → failed
- initial_ready means first 10 are available
- ready means full 50 are available
- Do not mark ready unless 50 questions exist
- Do not use EdgeRuntime.waitUntil

Plans:
- Pro: $29/month
- Pro intro: $19 first month, then $29/month
- Coach+: $79/month
- All prices in USD
- No GBP

Language:
- UK English everywhere
- Use “practise” as the verb
- Avoid US spelling and salesy phrasing

LinkedIn:
- LinkedIn profile input must appear above CV upload/paste
- Language should be neutral, clear, not salesy

Testing:
- TESTING_MODE may relax commercial limits
- TESTING_MODE must not weaken auth, RLS, private CV storage, workspace scoping, or server-side AI security

Admin:
- /admin must be platform_admin only
- No destructive user deletion tools from the app

Schema note:
- If interview_questions uses session_id, do not rename it during beta stabilisation unless absolutely necessary.
- Treat interview_questions.session_id as referencing prep_sessions.id.
- generation_jobs may use prep_session_id.

## Codex Behaviour

First audit. Do not change files until asked.

When fixing:
- make the smallest safe changes
- do not redesign
- do not add features unless required
- preserve direct Lovable edits unless broken
- run build/lint/tests if available
- report exact files changed
