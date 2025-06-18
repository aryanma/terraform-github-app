import { NextRequest, NextResponse } from 'next/server';
import { Webhooks } from '@octokit/webhooks';
import fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import type { RestEndpointMethodTypes } from '@octokit/rest';

const APP_ID = process.env.APP_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const PRIVATE_KEY_PATH = process.env.PRIVATE_KEY_PATH;
const PREFS_PATH = path.resolve(process.cwd(), 'user-preferences.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Needs to be set for Octokit actions

// Initialize Octokit Webhooks
const webhooks = new Webhooks({
  secret: WEBHOOK_SECRET || '',
});

function loadPreferences() {
  if (!fs.existsSync(PREFS_PATH)) return {};
  return JSON.parse(fs.readFileSync(PREFS_PATH, 'utf-8'));
}

function savePreferences(prefs: any) {
  fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2));
}

// Helper: Download a file from GitHub
async function downloadFileFromGitHub(
  octokit: Octokit,
  owner: string,
  repo: string,
  filePath: string,
  ref: string
): Promise<string> {
  const { data } = await octokit.repos.getContent({ owner, repo, path: filePath, ref });
  if ('content' in data && data.content) {
    return Buffer.from(data.content, 'base64').toString('utf-8');
  }
  return '';
}

// Helper: Call Ollama LLM
async function callOllamaLLM(prompt: string): Promise<string> {
  const res = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama2', prompt, stream: false })
  });
  const data = await res.json();
  return data.response || 'No response from LLM.';
}

// PR event handler
webhooks.on('pull_request.opened', async ({ payload }) => {
  const repoFullName = payload.repository.full_name; // e.g. aryanma/test
  const prefs = loadPreferences();
  const userPrefs = prefs[repoFullName];
  if (!userPrefs) {
    console.log('No user preferences found for repo:', repoFullName);
    return;
  }
  const priorities = userPrefs.priorities;
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const prNumber = payload.pull_request.number;
  const baseSha = payload.pull_request.base.sha;
  const headSha = payload.pull_request.head.sha;

  // 1. Get list of changed files in the PR
  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const filesRes = await octokit.pulls.listFiles({ owner, repo, pull_number: prNumber });
  const tfFiles = filesRes.data.filter((f: RestEndpointMethodTypes['pulls']['listFiles']['response']['data'][0]) => f.filename.endsWith('.tf'));
  if (tfFiles.length === 0) {
    console.log('No Terraform files changed in this PR.');
    return;
  }

  // 2. Download each changed Terraform file (from the PR head)
  const tempDir = path.join('/tmp', `pr-${prNumber}-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });
  for (const file of tfFiles) {
    const fileContent = await downloadFileFromGitHub(octokit, owner, repo, file.filename, headSha);
    const filePath = path.join(tempDir, file.filename);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, fileContent);
  }

  // 3. Run TFLint on the downloaded files
  let tflintOutput = '';
  try {
    tflintOutput = execSync(`tflint --format json ${tempDir}`, { encoding: 'utf-8' });
  } catch (err: any) {
    tflintOutput = err.stdout || err.message;
  }

  // 4. Call Ollama LLM with a prompt
  const prompt = `A user has asked for a Terraform PR review with the following priorities: "${priorities}".\n\nHere are the TFLint results for the changed files (in JSON):\n${tflintOutput}\n\nPlease summarize the most important findings for the user, focusing on their stated priorities. If possible, suggest actionable improvements.`;
  let llmSummary = '';
  try {
    llmSummary = await callOllamaLLM(prompt);
  } catch (e) {
    llmSummary = 'LLM error: ' + (e as Error).message;
  }

  // 5. Post a PR comment (requires GITHUB_TOKEN with repo:write)
  await octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: llmSummary,
  });

  // Cleanup temp files
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// POST /api/webhook for saving user preferences from the frontend and handling PR events
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    // Save user preferences
    const { repo, priorities } = await req.json();
    if (!repo) return NextResponse.json({ error: 'Missing repo' }, { status: 400 });
    const prefs = loadPreferences();
    prefs[repo] = { priorities };
    savePreferences(prefs);
    return NextResponse.json({ ok: true });
  }
  const signature = req.headers.get('x-hub-signature-256') || '';
  const event = req.headers.get('x-github-event') || '';
  const id = req.headers.get('x-github-delivery') || '';
  const body = await req.text();

  try {
    await webhooks.verifyAndReceive({
      id,
      name: event,
      payload: body,
      signature,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return NextResponse.json({ ok: false, error: 'Invalid webhook' }, { status: 400 });
  }
} 