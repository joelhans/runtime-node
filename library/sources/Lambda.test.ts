import * as FakeTimers from "@sinonjs/fake-timers";
import type { Context } from "aws-lambda";
import * as t from "tap";
import { Agent } from "../agent/Agent";
import { setInstance } from "../agent/AgentSingleton";
import { APIForTesting } from "../agent/api/APIForTesting";
import { Token } from "../agent/api/Token";
import { getContext } from "../agent/Context";
import { LoggerNoop } from "../agent/logger/LoggerNoop";
import { createLambdaWrapper, SQSEvent, APIGatewayProxyEvent } from "./Lambda";

const gatewayEvent: APIGatewayProxyEvent = {
  body: "body",
  httpMethod: "GET",
  queryStringParameters: {
    query: "value",
  },
  headers: {
    "content-type": "application/json",
    cookie: "cookie=value",
  },
  requestContext: {
    identity: {
      sourceIp: "1.2.3.4",
    },
  },
};

const lambdaContext: Context = {
  awsRequestId: "",
  callbackWaitsForEmptyEventLoop: false,
  functionName: "",
  functionVersion: "",
  invokedFunctionArn: "",
  logGroupName: "",
  logStreamName: "",
  memoryLimitInMB: "",
  done: () => {},
  fail: () => {},
  getRemainingTimeInMillis: () => 0,
  succeed: () => {},
};

t.test("it transforms callback handler to async handler", async (t) => {
  const handler = createLambdaWrapper((event, context, callback) => {
    callback(null, {
      body: JSON.stringify(getContext()),
      statusCode: 200,
    });
  });

  const result = (await handler(
    gatewayEvent,
    lambdaContext,
    () => {}
  )) as unknown as { body: string };

  t.same(JSON.parse(result.body), {
    method: "GET",
    remoteAddress: "1.2.3.4",
    headers: {
      "content-type": "application/json",
      cookie: "cookie=value",
    },
    query: {
      query: "value",
    },
    cookies: {
      cookie: "value",
    },
    source: "lambda/gateway",
  });
});

t.test("callback handler throws error", async () => {
  const handler = createLambdaWrapper((event, context, callback) => {
    callback(new Error("error"));
  });

  try {
    await handler(gatewayEvent, lambdaContext, () => {});
  } catch (error) {
    t.same(error.message, "error");
  }
});

t.test("callback handler has internal error", async () => {
  const handler = createLambdaWrapper((event, context, callback) => {
    throw new Error("error");
  });

  try {
    await handler(gatewayEvent, lambdaContext, () => {});
  } catch (error) {
    t.same(error.message, "error");
  }
});

t.test("json header is missing for gateway event", async (t) => {
  const handler = createLambdaWrapper((event, context, callback) => {
    callback(null, {
      body: JSON.stringify(getContext()),
      statusCode: 200,
    });
  });

  const result = (await handler(
    {
      ...gatewayEvent,
      headers: {},
    },
    lambdaContext,
    () => {}
  )) as unknown as { body: string };

  t.same(JSON.parse(result.body), {
    method: "GET",
    remoteAddress: "1.2.3.4",
    headers: {},
    query: { query: "value" },
    cookies: {},
    source: "lambda/gateway",
  });
});

t.test("it handles SQS event", async (t) => {
  const handler = createLambdaWrapper(async (event, context) => {
    return getContext();
  });

  const event: SQSEvent = {
    Records: [
      {
        body: JSON.stringify({
          key: "value",
        }),
      },
    ],
  };

  const result = await handler(event, lambdaContext, () => {});

  t.same(result, {
    url: undefined,
    method: undefined,
    remoteAddress: undefined,
    body: {
      Records: [
        {
          body: {
            key: "value",
          },
        },
      ],
    },
    headers: {},
    query: {},
    cookies: {},
    source: "lambda/sqs",
  });
});

t.test("it passes through unknown types of events", async () => {
  const handler = createLambdaWrapper(async (event, context) => {
    return getContext();
  });

  const result = await handler(
    {
      unknown: "event",
    },
    lambdaContext,
    () => {}
  );

  t.same(result, undefined);
});

t.test("it sends heartbeat after first and every 10 minutes", async () => {
  const clock = FakeTimers.install();

  const logger = new LoggerNoop();
  const testing = new APIForTesting();
  const agent = new Agent(false, logger, testing, new Token("123"), "lambda");
  agent.start([]);
  setInstance(agent);

  const handler = createLambdaWrapper(async (event, context) => {
    return getContext();
  });

  testing.clear();

  t.same(testing.getEvents(), []);

  for (let i = 0; i < 99; i++) {
    agent.getInspectionStatistics().onInspectedCall({
      sink: "mongodb",
      blocked: false,
      durationInMs: 0.1,
      attackDetected: false,
    });

    await handler(gatewayEvent, lambdaContext, () => {});

    if (i === 0) {
      t.match(testing.getEvents(), [{ type: "heartbeat" }]);
    }
  }

  t.match(testing.getEvents(), [{ type: "heartbeat" }]);

  testing.clear();

  clock.tick(1);

  agent.getInspectionStatistics().onInspectedCall({
    sink: "mongodb",
    blocked: false,
    durationInMs: 0.1,
    attackDetected: false,
  });

  await handler(gatewayEvent, lambdaContext, () => {});

  t.same(testing.getEvents(), []);

  clock.tick(60 * 1000 * 10);

  agent.getInspectionStatistics().onInspectedCall({
    sink: "mongodb",
    blocked: false,
    durationInMs: 0.1,
    attackDetected: false,
  });

  await handler(gatewayEvent, lambdaContext, () => {});

  t.same(testing.getEvents(), [
    {
      type: "heartbeat",
      time: Date.now(),
      // @ts-expect-error AgentInfo is private
      agent: agent.getAgentInfo(),
      stats: {
        sinks: {
          mongodb: {
            total: 100,
            attacksDetected: {
              total: 0,
              blocked: 0,
            },
            interceptorThrewError: 0,
            withoutContext: 0,
            compressedTimings: [
              {
                averageInMS: 0.09999999999999981,
                percentiles: {
                  50: 0.1,
                  75: 0.1,
                  90: 0.1,
                  95: 0.1,
                  99: 0.1,
                },
                compressedAt: 60 * 1000 * 10 + 1,
              },
            ],
          },
        },
        startedAt: 0,
        endedAt: 60 * 1000 * 10 + 1,
        requests: {
          total: 100,
          attacksDetected: {
            total: 0,
            blocked: 0,
          },
        },
      },
    },
  ]);

  clock.uninstall();
});

t.test(
  "it keeps working if token is not set (no reset happening)",
  async () => {
    const clock = FakeTimers.install();

    const logger = new LoggerNoop();
    const testing = new APIForTesting();
    const agent = new Agent(false, logger, testing, undefined, "lambda");
    agent.start([]);
    setInstance(agent);

    const handler = createLambdaWrapper(async (event, context) => {
      return getContext();
    });

    testing.clear();

    for (let i = 0; i < 100; i++) {
      agent.getInspectionStatistics().onInspectedCall({
        sink: "mongodb",
        blocked: false,
        durationInMs: 0.1,
        attackDetected: false,
      });
      await handler(gatewayEvent, lambdaContext, () => {});
    }

    t.same(testing.getEvents(), []);

    clock.uninstall();
  }
);

t.test("if handler throws it still sends heartbeat", async () => {
  const clock = FakeTimers.install();

  const logger = new LoggerNoop();
  const testing = new APIForTesting();
  const agent = new Agent(false, logger, testing, new Token("token"), "lambda");
  agent.start([]);
  setInstance(agent);

  testing.clear();

  const handler = createLambdaWrapper(async (event, context) => {
    throw new Error("error");
  });

  const error = await t.rejects(
    async () => await handler(gatewayEvent, lambdaContext, () => {})
  );

  if (error instanceof Error) {
    t.same(error.message, "error");
  }

  t.match(testing.getEvents(), [{ type: "heartbeat" }]);

  clock.uninstall();
});