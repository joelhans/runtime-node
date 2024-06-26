import * as t from "tap";
import { Agent } from "../agent/Agent";
import { APIForTesting } from "../agent/api/APIForTesting";
import { LoggerNoop } from "../agent/logger/LoggerNoop";
import { Express } from "./Express";

// Before require("express")
const agent = new Agent(
  true,
  new LoggerNoop(),
  new APIForTesting(),
  undefined,
  "lambda"
);
agent.start([new Express()]);

import * as express from "express";
import * as request from "supertest";
import * as cookieParser from "cookie-parser";
import { getContext } from "../agent/Context";

function getApp() {
  const app = express();

  app.set("trust proxy", true);
  app.set("env", "test");
  app.use(cookieParser());

  app.get("/", (req, res) => {
    const context = getContext();

    res.send(context);
  });

  app.post("/", express.json(), (req, res) => {
    const context = getContext();

    res.send(context);
  });

  app.route("/route").get((req, res) => {
    const context = getContext();

    res.send(context);
  });

  app.all("/all", (req, res) => {
    const context = getContext();

    res.send(context);
  });

  app.get("/detect-attack", (req, res) => {
    const context = getContext();
    context.attackDetected = true;

    res.send(context);
  });

  app.get("/posts/:id", (req, res) => {
    const context = getContext();

    res.send(context);
  });

  app.get("/throws", (req, res) => {
    throw new Error("test");
  });

  app.get(/.*fly$/, (req, res) => {
    const context = getContext();

    res.send(context);
  });

  return app;
}

t.test("it adds context from request for GET", async (t) => {
  const response = await request(getApp())
    .get("/?title[$ne]=null")
    .set("Cookie", "session=123")
    .set("Accept", "application/json")
    .set("X-Forwarded-For", "1.2.3.4");

  t.match(response.body, {
    method: "GET",
    query: { title: { $ne: "null" } },
    cookies: { session: "123" },
    headers: { accept: "application/json", cookie: "session=123" },
    remoteAddress: "1.2.3.4",
    source: "express",
    route: "/",
  });
});

t.test("it adds context from request for POST", async (t) => {
  const response = await request(getApp()).post("/").send({ title: "Title" });

  t.match(response.body, {
    method: "POST",
    body: { title: "Title" },
    source: "express",
    route: "/",
  });
});

t.test("it adds context from request for route", async (t) => {
  const response = await request(getApp()).get("/route");

  t.match(response.body, {
    method: "GET",
    query: {},
    cookies: {},
    headers: {},
    source: "express",
    route: "/route",
  });
});

t.test("it adds context from request for all", async (t) => {
  const response = await request(getApp()).get("/all");

  t.match(response.body, {
    method: "GET",
    query: {},
    cookies: {},
    headers: {},
    source: "express",
    route: "/all",
  });
});

t.test("it counts requests", async () => {
  agent.getInspectionStatistics().reset();
  await request(getApp()).get("/");
  await request(getApp()).post("/");
  t.match(agent.getInspectionStatistics().getStats(), {
    requests: {
      total: 2,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });
});

t.test("it counts attacks detected", async (t) => {
  agent.getInspectionStatistics().reset();
  await request(getApp()).get("/detect-attack");
  t.match(agent.getInspectionStatistics().getStats(), {
    requests: {
      total: 1,
      attacksDetected: {
        total: 1,
        blocked: 1,
      },
    },
  });
});

t.test("it counts request with error", async (t) => {
  agent.getInspectionStatistics().reset();
  await request(getApp()).get("/throws");
  t.match(agent.getInspectionStatistics().getStats(), {
    requests: {
      total: 1,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });
});

t.test("it adds context from request for route with params", async (t) => {
  const response = await request(getApp()).get("/posts/123");

  t.match(response.body, {
    method: "GET",
    routeParams: { id: "123" },
    source: "express",
    route: "/posts/:id",
  });
});

t.test("it deals with regex routes", async (t) => {
  const response = await request(getApp()).get("/butterfly");

  t.match(response.body, {
    method: "GET",
    query: {},
    cookies: {},
    headers: {},
    source: "express",
    route: "/.*fly$",
  });
});
