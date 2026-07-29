import Fastify from "fastify";
import { config } from "./config.js";
import { registerRoutes } from "./routes.js";
import { recoverInterruptedAudits } from "./pipeline/run.js";
import { pickProvider } from "./pipeline/llm.js";
import { startMonitorScheduler } from "./monitor.js";

const app = Fastify({
  logger: {
    level: "info",
    // Structured logs with request ids; never log tokens or page HTML.
    redact: ["req.headers.authorization"],
  },
  genReqId: () => crypto.randomUUID(),
  bodyLimit: 64 * 1024,
  maxParamLength: 512, // signed file tokens exceed the 100-char default
  // Real client IP behind the platform proxy (Fly/Render). Without this,
  // per-IP rate limits and the new-user cap see only the proxy's IP.
  trustProxy: config.trustProxy,
});

await registerRoutes(app);

app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
  req.log.error({ err: { message: err.message, name: err.name } }, "request error");
  reply.code(err.statusCode ?? 500).send({ error: "internal_error" });
});

const recovered = recoverInterruptedAudits();
if (recovered > 0) {
  app.log.warn(`recovered ${recovered} audit(s) interrupted by the previous shutdown (credits refunded)`);
}

startMonitorScheduler();

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `Verdict API on http://${config.host}:${config.port} — ai=${pickProvider()} dev=${config.devMode}`,
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
