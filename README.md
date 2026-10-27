# Quiz Arena — OpenAI-connected project

This project keeps the API key on the server. Do not put your API key in `index.html`, send it in chat, or commit it to a public repository.

## What it does
- Topic-specific AI-generated MCQs shown inside Quiz Arena
- Easy, Moderate, and Tough levels
- Solo Challenge and Team Showdown (2–8 teams)
- Four options, timer, explanations, scoring, and leaderboard
- Loading screen while the server requests questions from OpenAI

## Run it on a computer/server
Requires Node.js 20+ and internet access. API usage may cost money and must be enabled for your OpenAI developer account.

1. Keep `index.html`, `server.js`, and `package.json` in the same folder.
2. Set `OPENAI_API_KEY` as a private environment variable in the hosting provider's **Secrets/Environment Variables** settings. Never paste it into the HTML file or a public chat.
3. Optional: set `OPENAI_MODEL` to a model available to your API account. Default is `gpt-4.1-mini`.
4. Run `npm start` on the host. Open the server's public HTTPS address in a browser.
5. Check `/health`; it should return `{"ok":true,"apiKeyConfigured":true}`.
6. Test with 2 questions before using larger rounds. The server limits each round to 20 questions and requests to 8 per minute per client.

## Important for emailing the project
Sending only `index.html` will **not** provide AI generation. The server must be deployed to a host and its private environment variable configured first. If you email this ZIP, your teacher can inspect the project, but the AI mode will work only after the server is deployed and configured. Do not email a ZIP containing your API key.

## Troubleshooting
- `OPENAI_API_KEY is not configured`: add the key in the hosting provider's private Secrets/Environment Variables settings.
- API billing/quota error: check the API account's billing and usage limits. ChatGPT subscription and API usage are separate.
- Network or model error: check that the server can reach `api.openai.com` and that the selected model is available to the API account.
