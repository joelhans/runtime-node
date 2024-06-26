import * as FakeTimers from "@sinonjs/fake-timers";
import * as t from "tap";
import { InspectionStatistics } from "./InspectionStatistics";

t.test("it resets stats", async () => {
  const clock = FakeTimers.install();

  const stats = new InspectionStatistics({
    maxPerfSamplesInMemory: 50,
    maxCompressedStatsInMemory: 5,
  });

  stats.onInspectedCall({
    withoutContext: false,
    sink: "mongodb",
    blocked: false,
    durationInMs: 0.1,
    attackDetected: false,
  });

  t.same(stats.getStats(), {
    sinks: {
      mongodb: {
        attacksDetected: {
          total: 0,
          blocked: 0,
        },
        interceptorThrewError: 0,
        withoutContext: 0,
        total: 1,
        compressedTimings: [],
      },
    },
    startedAt: 0,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  clock.tick(1000);
  stats.reset();
  t.same(stats.getStats(), {
    sinks: {},
    startedAt: 1000,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  clock.uninstall();
});

t.test("it keeps track of amount of calls", async () => {
  const clock = FakeTimers.install();

  const maxPerfSamplesInMemory = 50;
  const maxCompressedStatsInMemory = 5;
  const stats = new InspectionStatistics({
    maxPerfSamplesInMemory: maxPerfSamplesInMemory,
    maxCompressedStatsInMemory: maxCompressedStatsInMemory,
  });

  t.same(stats.getStats(), {
    sinks: {},
    startedAt: 0,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  stats.onInspectedCall({
    withoutContext: false,
    sink: "mongodb",
    blocked: false,
    durationInMs: 0.1,
    attackDetected: false,
  });

  t.same(stats.getStats(), {
    sinks: {
      mongodb: {
        attacksDetected: {
          total: 0,
          blocked: 0,
        },
        interceptorThrewError: 0,
        withoutContext: 0,
        total: 1,
        compressedTimings: [],
      },
    },
    startedAt: 0,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  stats.onInspectedCall({
    withoutContext: true,
    sink: "mongodb",
    blocked: false,
    durationInMs: 0.1,
    attackDetected: false,
  });

  t.same(stats.getStats(), {
    sinks: {
      mongodb: {
        attacksDetected: {
          total: 0,
          blocked: 0,
        },
        interceptorThrewError: 0,
        withoutContext: 1,
        total: 2,
        compressedTimings: [],
      },
    },
    startedAt: 0,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  stats.interceptorThrewError("mongodb");

  t.same(stats.getStats(), {
    sinks: {
      mongodb: {
        attacksDetected: {
          total: 0,
          blocked: 0,
        },
        interceptorThrewError: 1,
        withoutContext: 1,
        total: 3,
        compressedTimings: [],
      },
    },
    startedAt: 0,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  stats.onInspectedCall({
    withoutContext: false,
    sink: "mongodb",
    blocked: false,
    durationInMs: 0.1,
    attackDetected: true,
  });

  t.same(stats.getStats(), {
    sinks: {
      mongodb: {
        attacksDetected: {
          total: 1,
          blocked: 0,
        },
        interceptorThrewError: 1,
        withoutContext: 1,
        total: 4,
        compressedTimings: [],
      },
    },
    startedAt: 0,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  stats.onInspectedCall({
    withoutContext: false,
    sink: "mongodb",
    blocked: true,
    durationInMs: 0.3,
    attackDetected: true,
  });

  t.same(stats.getStats(), {
    sinks: {
      mongodb: {
        attacksDetected: {
          total: 2,
          blocked: 1,
        },
        interceptorThrewError: 1,
        withoutContext: 1,
        total: 5,
        compressedTimings: [],
      },
    },
    startedAt: 0,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  t.same(stats.hasCompressedStats(), false);

  clock.tick(1000);

  for (let i = 0; i < maxPerfSamplesInMemory; i++) {
    stats.onInspectedCall({
      withoutContext: false,
      sink: "mongodb",
      blocked: false,
      durationInMs: i * 0.1,
      attackDetected: false,
    });
  }

  t.same(stats.hasCompressedStats(), true);
  t.same(stats.getStats(), {
    sinks: {
      mongodb: {
        attacksDetected: {
          total: 2,
          blocked: 1,
        },
        interceptorThrewError: 1,
        withoutContext: 1,
        total: 55,
        compressedTimings: [
          {
            averageInMS: 2.1719999999999997,
            percentiles: {
              "50": 2.1,
              "75": 3.4000000000000004,
              "90": 4.1000000000000005,
              "95": 4.4,
              "99": 4.6000000000000005,
            },
            compressedAt: 1000,
          },
        ],
      },
    },
    startedAt: 0,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  // @ts-expect-error Stats is private
  t.ok(stats.stats.mongodb.durations.length < maxPerfSamplesInMemory);

  for (
    let i = 0;
    i < maxPerfSamplesInMemory * maxCompressedStatsInMemory * 2;
    i++
  ) {
    stats.onInspectedCall({
      withoutContext: false,
      sink: "mongodb",
      blocked: false,
      durationInMs: i * 0.1,
      attackDetected: false,
    });
  }

  t.same(
    // @ts-expect-error Stats is private
    stats.stats.mongodb.compressedTimings.length,
    maxCompressedStatsInMemory
  );

  clock.uninstall();
});

t.test("it keeps track of requests", async () => {
  const clock = FakeTimers.install();

  const stats = new InspectionStatistics({
    maxPerfSamplesInMemory: 50,
    maxCompressedStatsInMemory: 5,
  });

  t.same(stats.getStats(), {
    sinks: {},
    startedAt: 0,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  stats.onRequest({
    attackDetected: false,
    blocked: false,
  });

  t.same(stats.getStats(), {
    sinks: {},
    startedAt: 0,
    requests: {
      total: 1,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  stats.onRequest({
    attackDetected: true,
    blocked: false,
  });

  t.same(stats.getStats(), {
    sinks: {},
    startedAt: 0,
    requests: {
      total: 2,
      attacksDetected: {
        total: 1,
        blocked: 0,
      },
    },
  });

  stats.onRequest({
    attackDetected: true,
    blocked: true,
  });

  t.same(stats.getStats(), {
    sinks: {},
    startedAt: 0,
    requests: {
      total: 3,
      attacksDetected: {
        total: 2,
        blocked: 1,
      },
    },
  });

  clock.tick(1000);

  stats.reset();

  t.same(stats.getStats(), {
    sinks: {},
    startedAt: 1000,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  clock.uninstall();
});

t.test("it force compresses stats", async () => {
  const clock = FakeTimers.install();

  const stats = new InspectionStatistics({
    maxPerfSamplesInMemory: 50,
    maxCompressedStatsInMemory: 5,
  });

  t.same(stats.getStats(), {
    sinks: {},
    startedAt: 0,
    requests: {
      total: 0,
      attacksDetected: {
        total: 0,
        blocked: 0,
      },
    },
  });

  stats.onRequest({
    attackDetected: false,
    blocked: false,
  });

  stats.onInspectedCall({
    withoutContext: false,
    sink: "mongodb",
    blocked: false,
    durationInMs: 0.1,
    attackDetected: false,
  });

  t.same(stats.hasCompressedStats(), false);

  stats.forceCompress();

  t.same(stats.hasCompressedStats(), true);

  clock.uninstall();
});
