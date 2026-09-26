import React, { useState } from "react";
import { ChatCircleDots, ArrowSquareOut, Copy } from "@phosphor-icons/react";
import { shortDate } from "./SessionViews.jsx";

export function ChatGPTPage({
  connected,
  session,
  onPrepare,
  busy,
  prepared,
  setPrepared,
  notice,
}) {
  const [question, setQuestion] = useState(
    "How do my latest annotations and additional context change your interpretation of this session?",
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR TRAINING, IN CONVERSATION</p>
          <h1>Bring the session into ChatGPT.</h1>
          <p>Review your paddle, add context, and ask the next question.</p>
        </div>
        <span className={`connection-badge ${connected ? "connected" : ""}`}>
          <span />
          {connected ? "Connected in ChatGPT" : "Local preview · not connected"}
        </span>
      </div>
      <div className="chat-grid">
        <section className="ask-panel">
          <ChatCircleDots size={32} color="#008996" />
          <h2>Ask about {session.title}</h2>
          <p>
            {shortDate(session.date)} · {session.annotations.length} annotations
            · context revision {session.revision}
          </p>
          <label htmlFor="analysis-question">Your question</label>
          <textarea
            id="analysis-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={2000}
            rows={4}
          />
          <button
            className="button primary"
            disabled={busy || !question.trim()}
            onClick={() => onPrepare(question)}
          >
            <ChatCircleDots size={18} />
            {connected ? "Ask ChatGPT" : "Prepare analysis prompt"}
          </button>
          <p className="caption">
            Includes saved notes, extra context, source metrics, and a small
            telemetry sample. ChatGPT performs the analysis in your
            conversation.
          </p>
          {prepared && (
            <div className="prepared-context">
              <div className="section-heading">
                <h3>Ready to use in chat</h3>
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(prepared);
                      notice("Analysis prompt copied.");
                    } catch {
                      notice("Select the text below and copy it manually.");
                    }
                  }}
                >
                  <Copy size={16} /> Copy
                </button>
              </div>
              <textarea
                aria-label="Prepared analysis prompt"
                value={prepared}
                readOnly
                rows={8}
              />
              <button className="text-button" onClick={() => setPrepared("")}>
                Clear preview
              </button>
            </div>
          )}
        </section>
        <section className="connect-panel">
          <h2>Connect your app</h2>
          <p>
            Start the local server, then connect it through a Secure MCP Tunnel.
            Setup is done once in your account.
          </p>
          <ol className="connection-steps">
            <li>
              <strong>Build and run locally</strong>
              <code>
                npm run build
                <br />
                npm start
              </code>
              <span>Your app and MCP endpoint run on port 3001.</span>
            </li>
            <li>
              <strong>Create a Secure MCP Tunnel</strong>
              <span>
                Forward to <code>http://127.0.0.1:3001/mcp</code> using the
                official tunnel client.
              </span>
            </li>
            <li>
              <strong>Add it to ChatGPT</strong>
              <span>
                Enable Developer mode in Settings, create a plugin with your
                tunnel, and select it in a conversation.
              </span>
            </li>
          </ol>
          <a
            className="text-button"
            href="https://developers.openai.com/plugins/deploy/connect-chatgpt"
            target="_blank"
            rel="noreferrer"
          >
            Official connection guide <ArrowSquareOut size={16} />
          </a>
          <p className="caption">
            The project README includes all setup steps. Developer mode and
            tunnels depend on account and workspace availability.
          </p>
        </section>
      </div>
    </>
  );
}
