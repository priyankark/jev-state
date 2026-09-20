import { toPromise } from "xstate";
import { supportMachine } from "./machine.js";
import { createMockProvider } from "../../server/mock.js";

// Replace createMockProvider() with createJevProvider(new TypeSafeClient())
// in server-side code to run this same machine with live Jev judgments.
const actor = supportMachine.createActor(
  createMockProvider("auto", 0),
  { ticket: { message: "I was charged twice" } },
  0.8,
);
actor.subscribe((snapshot) => console.log(snapshot.value));
const done = toPromise(actor);
actor.start();
actor.send({ type: "RUN" });
await done;
console.log(JSON.stringify(actor.getSnapshot().context.policy, null, 2));
actor.stop();
