# Your first Jev workflow

This walkthrough uses the support example. It runs in simulation without an account. The same project can later use live Jev routing.

## 1. Create an editable copy

Open the [public demo](https://jev-state.vercel.app) or your local server. Under **Start with an example**, choose the support workflow, name it, and create the project. The template remains unchanged; your copy appears under **Your projects**.

The starting state is Welcome. Its outgoing paths lead to Billing help, Technical help, and Human review. Billing and technical paths can later reach Resolved. Resolved is an end state.

## 2. Read and edit a state

Open **Define** and click Billing help. A state's description answers **when should Jev enter this state?** Make it concrete, such as “The user is asking about a charge, invoice, payment, or refund.” Avoid instructions that overlap several destinations without explaining the difference.

The state reply is the assistant message after entering that state. Simulation keywords are a separate fixture mechanism: `charged`, `invoice`, or `refund` route a matching simulated message into Billing help. Changing keywords does not teach the live model; change the state description and workflow instructions for live behavior.

Drag a state to reposition it. Drag its right connection handle onto another state's left handle to create an allowed transition. Click an edge to inspect or remove it. Use **Auto layout** to arrange the graph, **Expand graph** for more room, or the state list to select a state. Undo/redo restores edits made in this editing session.

Self-edges are unnecessary because the runtime always supplies a `stay` option. End states cannot have outgoing edges. Workflow checks flag disconnected states, dead ends, missing criteria, and paths that cannot reach an end state; an intentionally ongoing loop is allowed.

Click **Save workflow**. Moving states only changes the layout; changing policy, state behavior, or agent settings advances the workflow version.

## 3. Try a conversation

Open **Try**, select **Simulation**, and send:

```text
I was charged twice
It is fixed now
```

The first message moves Welcome → Billing help. The second moves Billing help → Resolved. Click a turn to inspect its input, Choice criteria, probability distribution, timing, and the reason the threshold allowed or rejected a transition.

Start another conversation and send `Hello`. With no keyword match, simulation stays in Welcome. Its fixed confidence is 60%, below the example's 75% threshold. Simulation probabilities and confidence are fixtures to exercise UI behavior, not live inference measurements.

An end state disables further messages. Start a new conversation to try another path. Older conversations retain their workflow snapshot; behavior changes require a fresh conversation.

## 4. Turn the conversation into a regression test

Under your conversation, choose **Save as regression test**. The user messages are already filled in. Confirm the expected state, even if the conversation reached the wrong one. Save to open **Test**. You can also choose **Add case** and enter:

- Name: `Duplicate charge resolved`
- User message 1: `I was charged twice`
- Choose **Add user turn**, then User message 2: `It is fixed now`
- Expected final state: `Resolved`
- Optional final reply substring: a phrase from the Resolved reply

Each message box represents one turn; line breaks remain part of that message. Enable **Check intermediate states** and expect Billing help after turn 1 to protect the route as well as the ending. Editing messages clears intermediate checks so you can confirm them against the new conversation.

Run the suite and inspect the result. To see a real failure, duplicate the scenario with Technical help as the expected state. The report will show the actual final state and its turns. Use **Review state criteria** to inspect the intended destination, or **Edit expectation** if the test is wrong. Remove or correct that deliberately failing case when done.

After editing workflow behavior, rerun the same cases: the comparison highlights which regressed or were fixed. It compares only unchanged cases in the same mode; changing an expectation is labeled **Test changed**, not a fix. Open a result to read each user message, assistant reply, expected and actual state, and recorded decision criteria.

Every case runs independently from the initial state. Do not add user turns after a case reaches an end state. Coverage shows which paths ran; add cases for the paths still missing. Add no-match and ambiguous inputs as well as happy paths.

## 5. Switch to live Jev

On the public studio, choose **Connections → Connect Jev**, enter your own TypeSafe API key, and accept the usage notice. Keys stay in this tab’s memory and pass through the server for provider requests; reload or Disconnect clears them. Live usage is charged to your provider account. For a [local or protected deployment](SELF_HOSTING.md), you can alternatively put `TYPESAFE_API_KEY` in its server environment, restart, and test it in **Connections**. Select **Live Jev** and try paraphrases that do not contain your simulation keywords.

Use the inspection panel to understand disagreements. Was the needed destination connected? Were its criteria specific? Was relevant context in the conversation? Did the selected option fail your threshold? Update the workflow or add a regression case based on what you observe.

You can optionally enable generated replies in Workflow settings after connecting your OpenAI key (or configuring a server-side key locally). This changes reply generation; Jev still controls the state choice. No external business actions or tools are executed.

## 6. Get code for your app

Choose **Use in your app** or the **Get code** tab. The validation panel tells you whether current simulation and live checks have run, passed, failed, become stale, or stopped partway through. You can export at any stage; passing simulation does not establish live Jev accuracy.

Download the runnable project, unzip it, and run `npm install`, `npm run typecheck`, `npm test`, and `npm start` inside that directory. The default commands make no provider calls. The ZIP includes the same runtime used in the studio, your workflow and tests, a README, and an integration example. The **Copy file** button copies whichever file you preview; `example.ts` imports `workflow.ts` from the download.

Set your own server keys in `.env` and explicitly select live mode when ready. Integrate `sendMessage` in your server handler, persist its returned session per user, and serialize turns for each conversation. See [Get code](GET_CODE.md) for the full handoff contract.

## 7. Keep and automate your work

**Export project** produces a portable workflow with its cases. Import creates a new copy. **Back up workspace** additionally includes saved conversations and reports; restoration replaces the destination workspace.

Use your exported project in CI:

```sh
npm run evaluate -- --project my-project.json --out report.json
```

Add `--mode live` only when you intend to use provider credentials and incur usage. A failing expectation returns exit code 1; configuration or execution errors return 2.
